from datetime import date, datetime, time, timedelta, timezone
import os
import secrets
from urllib.parse import urlsplit
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, SecretStr, field_validator

from admin_auth import PRIVATE_HEADERS, password_hasher, require_admin, token_digest
from database import connect_database
from email_settings import DeliveryStatus, get_delivery_settings, send_account_email, send_invitation_email


router = APIRouter(prefix="/admin/students", tags=["Student management"])
Admin = Annotated[dict, Depends(require_admin)]
FIELDS = "id, name, student_id, email, mobile, college, degree, year, github, linkedin, is_active, gender, created_at, updated_at"
INDIA = timezone(timedelta(hours=5, minutes=30))
Gender = Literal["Male", "Female", "Other", "Prefer not to say"]


class StudentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    student_id: str = Field(min_length=1, max_length=64)
    email: EmailStr = Field(max_length=254)
    mobile: str = Field(min_length=3, max_length=30, pattern=r"^[+0-9() .-]+$")
    college: str = Field(min_length=1, max_length=200)
    degree: str = Field(min_length=1, max_length=150)
    year: int = Field(ge=1, le=20, strict=True)
    github: HttpUrl | None = Field(default=None, max_length=500)
    linkedin: HttpUrl | None = Field(default=None, max_length=500)
    is_active: bool = Field(default=True, strict=True)
    gender: Gender | None = None

    @field_validator("name", "student_id", "email", "mobile", "college", "degree", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("email", mode="after")
    @classmethod
    def normalize_email(cls, value):
        return str(value).lower()

    @field_validator("github", "linkedin", mode="before")
    @classmethod
    def optional_link(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("github", "linkedin")
    @classmethod
    def secure_link(cls, value):
        if value is not None and (value.scheme != "https" or value.username or value.password):
            raise ValueError("Use an HTTPS URL without credentials.")
        return value


class StudentCreate(StudentInput):
    password: SecretStr = Field(min_length=8, max_length=128)


class PasswordReset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: SecretStr = Field(min_length=8, max_length=128)


class StudentRecord(BaseModel):
    id: int
    name: str
    student_id: str
    email: str
    mobile: str
    college: str
    degree: str
    year: int
    github: str | None
    linkedin: str | None
    is_active: bool
    gender: Gender | None = None
    created_at: datetime
    updated_at: datetime


class StudentList(BaseModel):
    items: list[StudentRecord]
    total: int
    page: int
    page_size: int


class StudentCreated(StudentRecord):
    email_delivery: DeliveryStatus


def missing_student():
    return HTTPException(404, "Student not found.", headers=PRIVATE_HEADERS)


def duplicate_student():
    return HTTPException(409, "Student ID or email is already in use, including archived accounts.", headers=PRIVATE_HEADERS)


def student_values(payload: StudentInput):
    return (
        payload.name, payload.student_id, str(payload.email), payload.mobile,
        payload.college, payload.degree, payload.year,
        str(payload.github) if payload.github else None,
        str(payload.linkedin) if payload.linkedin else None, payload.is_active,
        payload.gender,
    )


@router.get("/", response_model=StudentList)
def list_students(
    admin: Admin, response: Response,
    page: int = Query(default=1, ge=1, le=1000000),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=100),
    date_from: date | None = None, date_to: date | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date must not be after end date.", headers=PRIVATE_HEADERS)
    if date_to == date.max:
        raise HTTPException(422, "End date is out of range.", headers=PRIVATE_HEADERS)
    conditions = ["admin_id = %s", "deleted_at IS NULL"]
    values = [admin["id"]]
    if search.strip():
        term = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append("concat_ws(' ', name, student_id, email, college, degree) ILIKE %s")
        values.append(f"%{term}%")
    if date_from:
        conditions.append("created_at >= %s")
        values.append(datetime.combine(date_from, time.min, INDIA))
    if date_to:
        conditions.append("created_at < %s")
        values.append(datetime.combine(date_to + timedelta(days=1), time.min, INDIA))
    where = " AND ".join(conditions)
    with connect_database() as connection:
        total = connection.execute(f"SELECT count(*) AS total FROM students WHERE {where}", values).fetchone()["total"]
        records = connection.execute(
            f"SELECT {FIELDS} FROM students WHERE {where} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
            [*values, page_size, (page - 1) * page_size],
        ).fetchall()
    response.headers.update(PRIVATE_HEADERS)
    return {"items": records, "total": total, "page": page, "page_size": page_size}


@router.post("/", response_model=StudentCreated, status_code=201)
def create_student(payload: StudentCreate, admin: Admin, response: Response):
    hashed = password_hasher.hash(payload.password.get_secret_value())
    try:
        with connect_database() as connection:
            mail_settings = get_delivery_settings(connection, admin["id"])
            record = connection.execute(
                f"""INSERT INTO students
                (name, student_id, email, mobile, college, degree, year, github, linkedin, is_active, gender, password_hash, admin_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {FIELDS}""",
                (*student_values(payload), hashed, admin["id"]),
            ).fetchone()
    except UniqueViolation:
        raise duplicate_student() from None
    record["email_delivery"] = send_account_email(mail_settings, payload.name, str(payload.email), payload.password.get_secret_value(), "student")
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.get("/{record_id}", response_model=StudentRecord)
def get_student(record_id: int, admin: Admin, response: Response):
    with connect_database() as connection:
        record = connection.execute(
            f"SELECT {FIELDS} FROM students WHERE id = %s AND admin_id = %s AND deleted_at IS NULL",
            (record_id, admin["id"]),
        ).fetchone()
    if record is None:
        raise missing_student()
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.post("/{record_id}/invitation")
def invite_student(record_id: int, admin: Admin, response: Response):
    origin = os.environ.get("STUDENT_APP_ORIGIN", "").rstrip("/")
    parsed = urlsplit(origin)
    local = parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1") and os.environ.get("APP_ENV", "local") == "local"
    if not origin or (parsed.scheme != "https" and not local) or not parsed.netloc or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise HTTPException(503, "Student invitation URL is not configured.", headers=PRIVATE_HEADERS)
    token = secrets.token_urlsafe(32)
    digest = token_digest(token)
    with connect_database() as connection:
        record = connection.execute("SELECT * FROM students WHERE id=%s AND admin_id=%s AND deleted_at IS NULL FOR UPDATE", (record_id, admin["id"])).fetchone()
        if record is None:
            raise missing_student()
        if record["is_active"]:
            raise HTTPException(409, "This student already has an active account.", headers=PRIVATE_HEADERS)
        settings = get_delivery_settings(connection, admin["id"])
        if not settings:
            raise HTTPException(409, "Configure email settings before sending invitations.", headers=PRIVATE_HEADERS)
        recent = connection.execute("SELECT 1 FROM student_invitations WHERE student_id=%s AND created_at > clock_timestamp() - interval '60 seconds'", (record_id,)).fetchone()
        if recent:
            raise HTTPException(429, "Wait one minute before resending this invitation.", headers={**PRIVATE_HEADERS, "Retry-After": "60"})
        invitation = connection.execute(
            """INSERT INTO student_invitations (student_id, token_hash, student_updated_at, expires_at)
            VALUES (%s, %s, %s, clock_timestamp() + interval '24 hours')
            ON CONFLICT (student_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
            student_updated_at=EXCLUDED.student_updated_at, created_at=clock_timestamp(), expires_at=EXCLUDED.expires_at
            RETURNING expires_at""", (record_id, digest, record["updated_at"]),
        ).fetchone()
    delivery = send_invitation_email(settings, record["name"], record["email"], f"{origin}/student/setup-password#token={token}")
    if delivery != "accepted":
        with connect_database() as connection:
            connection.execute("DELETE FROM student_invitations WHERE student_id=%s AND token_hash=%s", (record_id, digest))
    response.headers.update(PRIVATE_HEADERS)
    return {"id": record_id, "email_delivery": delivery, "expires_at": invitation["expires_at"] if delivery == "accepted" else None}


@router.put("/{record_id}", response_model=StudentRecord)
def update_student(record_id: int, payload: StudentInput, admin: Admin, response: Response):
    try:
        with connect_database() as connection:
            record = connection.execute(
                f"""UPDATE students SET name=%s, student_id=%s, email=%s, mobile=%s, college=%s,
                degree=%s, year=%s, github=%s, linkedin=%s, is_active=%s, gender=%s
                WHERE id=%s AND admin_id=%s AND deleted_at IS NULL RETURNING {FIELDS}""",
                (*student_values(payload), record_id, admin["id"]),
            ).fetchone()
    except UniqueViolation:
        raise duplicate_student() from None
    if record is None:
        raise missing_student()
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.post("/{record_id}/password", status_code=204)
def reset_password(record_id: int, payload: PasswordReset, admin: Admin):
    with connect_database() as connection:
        record = connection.execute(
            "SELECT id FROM students WHERE id=%s AND admin_id=%s AND deleted_at IS NULL FOR UPDATE",
            (record_id, admin["id"]),
        ).fetchone()
        if record is None:
            raise missing_student()
        connection.execute(
            "UPDATE students SET password_hash=%s WHERE id=%s AND admin_id=%s",
            (password_hasher.hash(payload.password.get_secret_value()), record_id, admin["id"]),
        )
    return Response(status_code=204, headers=PRIVATE_HEADERS)


@router.delete("/{record_id}", status_code=204)
def delete_student(record_id: int, admin: Admin):
    with connect_database() as connection:
        record = connection.execute(
            """UPDATE students SET deleted_at=clock_timestamp(), is_active=FALSE
            WHERE id=%s AND admin_id=%s AND deleted_at IS NULL RETURNING id""",
            (record_id, admin["id"]),
        ).fetchone()
    if record is None:
        raise missing_student()
    return Response(status_code=204, headers=PRIVATE_HEADERS)