from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from admin_auth import PRIVATE_HEADERS, password_hasher, require_admin
from database import connect_database
from email_settings import DeliveryStatus, get_delivery_settings, send_account_email


router = APIRouter(prefix="/admin/faculty", tags=["Faculty management"])
Admin = Annotated[dict, Depends(require_admin)]
Role = Literal["Principal", "HOD", "Professor", "Asst. Professor"]
FIELDS = "id, name, role, email, is_active, created_at, updated_at"
INDIA = timezone(timedelta(hours=5, minutes=30))


class FacultyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    role: Role
    email: EmailStr = Field(max_length=254)
    is_active: bool = Field(default=True, strict=True)

    @field_validator("name", "email", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).lower()


class FacultyCreate(FacultyInput):
    password: SecretStr = Field(min_length=8, max_length=128)


class PasswordReset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: SecretStr = Field(min_length=8, max_length=128)


class FacultyRecord(BaseModel):
    id: int
    name: str
    role: str
    email: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FacultyList(BaseModel):
    items: list[FacultyRecord]
    total: int
    page: int
    page_size: int


class FacultyCreated(FacultyRecord):
    email_delivery: DeliveryStatus


def missing_faculty():
    return HTTPException(404, "Faculty member not found.", headers=PRIVATE_HEADERS)


def duplicate_faculty():
    return HTTPException(409, "Email is already in use, including archived accounts.", headers=PRIVATE_HEADERS)


@router.get("/", response_model=FacultyList)
def list_faculty(
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
        conditions.append("concat_ws(' ', name, role, email) ILIKE %s")
        values.append(f"%{term}%")
    if date_from:
        conditions.append("created_at >= %s")
        values.append(datetime.combine(date_from, time.min, INDIA))
    if date_to:
        conditions.append("created_at < %s")
        values.append(datetime.combine(date_to + timedelta(days=1), time.min, INDIA))
    where = " AND ".join(conditions)
    with connect_database() as connection:
        total = connection.execute(f"SELECT count(*) AS total FROM faculty WHERE {where}", values).fetchone()["total"]
        records = connection.execute(
            f"SELECT {FIELDS} FROM faculty WHERE {where} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
            [*values, page_size, (page - 1) * page_size],
        ).fetchall()
    response.headers.update(PRIVATE_HEADERS)
    return {"items": records, "total": total, "page": page, "page_size": page_size}


@router.post("/", response_model=FacultyCreated, status_code=201)
def create_faculty(payload: FacultyCreate, admin: Admin, response: Response):
    hashed = password_hasher.hash(payload.password.get_secret_value())
    try:
        with connect_database() as connection:
            mail_settings = get_delivery_settings(connection, admin["id"])
            record = connection.execute(
                f"""INSERT INTO faculty (name, role, email, is_active, password_hash, admin_id)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING {FIELDS}""",
                (payload.name, payload.role, str(payload.email), payload.is_active, hashed, admin["id"]),
            ).fetchone()
    except UniqueViolation:
        raise duplicate_faculty() from None
    record["email_delivery"] = send_account_email(mail_settings, payload.name, str(payload.email), payload.password.get_secret_value(), "faculty")
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.get("/{record_id}", response_model=FacultyRecord)
def get_faculty(record_id: int, admin: Admin, response: Response):
    with connect_database() as connection:
        record = connection.execute(
            f"SELECT {FIELDS} FROM faculty WHERE id=%s AND admin_id=%s AND deleted_at IS NULL",
            (record_id, admin["id"]),
        ).fetchone()
    if record is None:
        raise missing_faculty()
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.put("/{record_id}", response_model=FacultyRecord)
def update_faculty(record_id: int, payload: FacultyInput, admin: Admin, response: Response):
    try:
        with connect_database() as connection:
            record = connection.execute(
                f"""UPDATE faculty SET name=%s, role=%s, email=%s, is_active=%s
                WHERE id=%s AND admin_id=%s AND deleted_at IS NULL RETURNING {FIELDS}""",
                (payload.name, payload.role, str(payload.email), payload.is_active, record_id, admin["id"]),
            ).fetchone()
    except UniqueViolation:
        raise duplicate_faculty() from None
    if record is None:
        raise missing_faculty()
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.post("/{record_id}/password", status_code=204)
def reset_password(record_id: int, payload: PasswordReset, admin: Admin):
    with connect_database() as connection:
        record = connection.execute(
            "SELECT id FROM faculty WHERE id=%s AND admin_id=%s AND deleted_at IS NULL FOR UPDATE",
            (record_id, admin["id"]),
        ).fetchone()
        if record is None:
            raise missing_faculty()
        connection.execute(
            "UPDATE faculty SET password_hash=%s WHERE id=%s AND admin_id=%s",
            (password_hasher.hash(payload.password.get_secret_value()), record_id, admin["id"]),
        )
    return Response(status_code=204, headers=PRIVATE_HEADERS)


@router.delete("/{record_id}", status_code=204)
def delete_faculty(record_id: int, admin: Admin):
    with connect_database() as connection:
        record = connection.execute(
            """UPDATE faculty SET deleted_at=clock_timestamp(), is_active=FALSE
            WHERE id=%s AND admin_id=%s AND deleted_at IS NULL RETURNING id""",
            (record_id, admin["id"]),
        ).fetchone()
    if record is None:
        raise missing_faculty()
    return Response(status_code=204, headers=PRIVATE_HEADERS)