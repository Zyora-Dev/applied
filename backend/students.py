import re
from datetime import date, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit

import psycopg
from email_validator import validate_email
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from auth import AdminResponse, password_hasher, require_admin
from database import connect_database


COLLEGE = "Arunachala Hitech Engineering College"
Admin = Annotated[AdminResponse, Depends(require_admin)]
router = APIRouter(prefix="/admin/students", tags=["Students"])


def initialize_student_tables(connection: psycopg.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS students (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            admin_id BIGINT NOT NULL REFERENCES admins(id),
            name TEXT NOT NULL,
            student_id TEXT NOT NULL,
            email TEXT NOT NULL,
            mobile TEXT NOT NULL,
            college TEXT NOT NULL CHECK (college = 'Arunachala Hitech Engineering College'),
            degree TEXT NOT NULL CHECK (degree IN ('B.E', 'B.Tech')),
            stream TEXT NOT NULL CHECK (stream IN ('AI&DS', 'ECE', 'CSE', 'EEE', 'Mech', 'Civil', 'Others')),
            github_url TEXT,
            linkedin_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (admin_id, student_id),
            UNIQUE (admin_id, email)
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS students_admin_created_idx ON students (admin_id, created_at DESC, id DESC)")
    connection.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash TEXT")
    connection.execute("""CREATE TABLE IF NOT EXISTS student_week_progress (
        student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 4),
        status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (student_id, week)
    )""")


class WeekProgressInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["not_started", "in_progress", "completed"]


def read_week_progress(connection: psycopg.Connection, student_id: int) -> list[dict]:
    with connection.cursor(row_factory=dict_row) as cursor:
        return cursor.execute("""SELECT weeks.week,
            COALESCE(progress.status, 'not_started') AS status, progress.updated_at
            FROM generate_series(1, 4) AS weeks(week)
            LEFT JOIN student_week_progress AS progress
            ON progress.week = weeks.week AND progress.student_id = %s
            ORDER BY weeks.week""", (student_id,)).fetchall()


@router.get("/{record_id}/progress")
def get_student_progress(record_id: int, admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        if connection.execute("SELECT id FROM students WHERE id=%s AND admin_id=%s", (record_id, admin.id)).fetchone() is None:
            raise HTTPException(404, "Student not found.")
        return {"weeks": read_week_progress(connection, record_id)}


@router.put("/{record_id}/progress/{week}")
def update_student_progress(record_id: int, week: int, payload: WeekProgressInput, admin: Admin, response: Response):
    if week not in range(1, 5):
        raise HTTPException(422, "Week must be between 1 and 4.")
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        if connection.execute("SELECT id FROM students WHERE id=%s AND admin_id=%s FOR UPDATE", (record_id, admin.id)).fetchone() is None:
            raise HTTPException(404, "Student not found.")
        connection.execute("""INSERT INTO student_week_progress (student_id, week, status)
            VALUES (%s, %s, %s) ON CONFLICT (student_id, week)
            DO UPDATE SET status=EXCLUDED.status, updated_at=CURRENT_TIMESTAMP""", (record_id, week, payload.status))
        return {"weeks": read_week_progress(connection, record_id)}


class StudentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    student_id: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=1, max_length=320)
    mobile: str = Field(min_length=7, max_length=30)
    college: Literal["Arunachala Hitech Engineering College"]
    degree: Literal["B.E", "B.Tech"]
    stream: Literal["AI&DS", "ECE", "CSE", "EEE", "Mech", "Civil", "Others"]
    github_url: str | None = Field(default=None, max_length=500)
    linkedin_url: str | None = Field(default=None, max_length=500)

    @field_validator("*", mode="before")
    @classmethod
    def strip_record_fields(cls, value, info):
        return value.strip() if isinstance(value, str) and info.field_name != "password" else value

    @field_validator("student_id")
    @classmethod
    def normalize_student_id(cls, value: str) -> str:
        return value.upper()

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return validate_email(value, check_deliverability=False).normalized.lower()

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, value: str) -> str:
        value = re.sub(r"[\s()-]", "", value)
        if not re.fullmatch(r"\+?[0-9]{7,15}", value):
            raise ValueError("Enter a mobile number with 7 to 15 digits and an optional country code.")
        return value

    @field_validator("github_url", "linkedin_url")
    @classmethod
    def validate_profile_url(cls, value: str | None, info) -> str | None:
        if not value:
            return None
        parsed = urlsplit(value)
        domain = "github.com" if info.field_name == "github_url" else "linkedin.com"
        if (parsed.scheme != "https" or parsed.hostname not in (domain, "www." + domain)
                or parsed.username or parsed.password or parsed.port not in (None, 443)
                or not parsed.path.strip("/") or any(character.isspace() for character in value)):
            raise ValueError(f"Enter an HTTPS profile link on {domain}.")
        return value


class StudentCreate(StudentInput):
    password: SecretStr = Field(min_length=12, max_length=1024)


class StudentUpdate(StudentInput):
    password: SecretStr | None = Field(default=None, min_length=12, max_length=1024)


class StudentResponse(StudentInput):
    id: int
    password_set: bool
    created_at: datetime
    updated_at: datetime


class StudentList(BaseModel):
    items: list[StudentResponse]
    total: int
    page: int
    page_size: int


STUDENT_COLUMNS = "id, name, student_id, email, mobile, college, degree, stream, github_url, linkedin_url, created_at, updated_at, (password_hash IS NOT NULL) AS password_set"


@router.delete("/{record_id}")
def delete_student(record_id: int, admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        with connect_database() as connection:
            student = connection.execute(
                "DELETE FROM students WHERE id=%s AND admin_id=%s RETURNING id",
                (record_id, admin.id),
            ).fetchone()
            if student is None:
                raise HTTPException(404, "Student not found.")
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(409, "This student has linked records and cannot be deleted.") from None
    return {"deleted": True}


@router.get("/summary")
def student_summary(admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    with connect_database() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            counts = cursor.execute(
                """SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE degree = 'B.E') AS be,
                    COUNT(*) FILTER (WHERE degree = 'B.Tech') AS btech
                    FROM students WHERE admin_id = %s""", (admin.id,),
            ).fetchone()
            streams = cursor.execute(
                "SELECT stream, COUNT(*) AS total FROM students WHERE admin_id = %s GROUP BY stream ORDER BY total DESC, stream",
                (admin.id,),
            ).fetchall()
    return {**counts, "streams": streams}


@router.get("", response_model=StudentList)
def list_students(
    admin: Admin, response: Response,
    search: str = Query(default="", max_length=150),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    date_from: date | None = None,
    date_to: date | None = None,
) -> StudentList:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date must not be later than end date.")
    response.headers["Cache-Control"] = "no-store"
    conditions = ["admin_id = %s"]
    parameters = [admin.id]
    if search.strip():
        conditions.append("(name ILIKE %s OR student_id ILIKE %s OR email ILIKE %s)")
        term = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        parameters.extend([f"%{term}%"] * 3)
    if date_from:
        conditions.append("created_at >= (%s::date::timestamp AT TIME ZONE 'Asia/Kolkata')")
        parameters.append(date_from)
    if date_to:
        conditions.append("created_at < ((%s::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')")
        parameters.append(date_to)
    where = " AND ".join(conditions)
    with connect_database() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            total = cursor.execute(f"SELECT COUNT(*) AS total FROM students WHERE {where}", parameters).fetchone()["total"]
            items = cursor.execute(
                f"SELECT {STUDENT_COLUMNS} FROM students WHERE {where} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
                [*parameters, page_size, (page - 1) * page_size],
            ).fetchall()
    return StudentList(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=StudentResponse, status_code=201)
def create_student(payload: StudentCreate, admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        with connect_database() as connection:
            with connection.transaction():
                with connection.cursor(row_factory=dict_row) as cursor:
                    return cursor.execute(
                        f"""INSERT INTO students
                        (admin_id, name, student_id, email, mobile, college, degree, stream, github_url, linkedin_url, password_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {STUDENT_COLUMNS}""",
                        [admin.id, *payload.model_dump(exclude={"password"}).values(), password_hasher.hash(payload.password.get_secret_value())],
                    ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "A student with this student ID or email already exists.") from None


@router.put("/{record_id}", response_model=StudentResponse)
def update_student(record_id: int, payload: StudentUpdate, admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        with connect_database() as connection:
            with connection.transaction():
                with connection.cursor(row_factory=dict_row) as cursor:
                    student = cursor.execute(
                        f"""UPDATE students SET name=%s, student_id=%s, email=%s, mobile=%s,
                        college=%s, degree=%s, stream=%s, github_url=%s, linkedin_url=%s,
                        password_hash=COALESCE(%s, password_hash), updated_at=CURRENT_TIMESTAMP
                        WHERE id=%s AND admin_id=%s RETURNING {STUDENT_COLUMNS}""",
                        [*payload.model_dump(exclude={"password"}).values(),
                         password_hasher.hash(payload.password.get_secret_value()) if payload.password is not None else None,
                         record_id, admin.id],
                    ).fetchone()
                    if student is None:
                        raise HTTPException(404, "Student not found.")
                    return student
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "A student with this student ID or email already exists.") from None