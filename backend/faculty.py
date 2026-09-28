from datetime import date, datetime
from typing import Annotated, Literal

import psycopg
from email_validator import validate_email
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from auth import AdminResponse, password_hasher, require_admin
from database import connect_database


Admin = Annotated[AdminResponse, Depends(require_admin)]
router = APIRouter(prefix="/admin/faculty", tags=["Faculty"])
FacultyRole = Literal["HOD", "Professor", "Asst. Professor", "Principal", "Director"]
FACULTY_COLUMNS = "id, name, role, email, is_active, created_at, updated_at"


def initialize_faculty_tables(connection: psycopg.Connection) -> None:
    connection.execute(
        """CREATE TABLE IF NOT EXISTS faculty (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            admin_id BIGINT NOT NULL REFERENCES admins(id),
            email TEXT NOT NULL CHECK (email = lower(email)),
            password_hash TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (admin_id, email)
        )"""
    )
    connection.execute("CREATE INDEX IF NOT EXISTS faculty_admin_created_idx ON faculty (admin_id, created_at DESC, id DESC)")
    connection.execute("ALTER TABLE faculty ADD COLUMN IF NOT EXISTS name TEXT CHECK (char_length(btrim(name)) BETWEEN 1 AND 150)")
    connection.execute("""ALTER TABLE faculty ADD COLUMN IF NOT EXISTS role TEXT
        CHECK (role IN ('HOD', 'Professor', 'Asst. Professor', 'Principal', 'Director'))""")


class FacultyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=150)
    role: FacultyRole
    email: str = Field(min_length=1, max_length=320)
    is_active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return validate_email(value.strip(), check_deliverability=False).normalized.lower()


class FacultyCreate(FacultyInput):
    password: SecretStr = Field(min_length=12, max_length=1024)


class FacultyUpdate(FacultyInput):
    password: SecretStr | None = Field(default=None, min_length=12, max_length=1024)


class FacultyResponse(BaseModel):
    id: int
    name: str | None
    role: FacultyRole | None
    email: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FacultyList(BaseModel):
    items: list[FacultyResponse]
    total: int
    page: int
    page_size: int


@router.get("", response_model=FacultyList)
def list_faculty(
    admin: Admin, response: Response,
    search: str = Query(default="", max_length=150),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    date_from: date | None = None, date_to: date | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date must not be later than end date.")
    response.headers["Cache-Control"] = "no-store"
    conditions = ["admin_id = %s"]
    parameters = [admin.id]
    if search.strip():
        conditions.append("(name ILIKE %s OR email ILIKE %s OR role ILIKE %s)")
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
            total = cursor.execute(f"SELECT COUNT(*) AS total FROM faculty WHERE {where}", parameters).fetchone()["total"]
            items = cursor.execute(
                f"SELECT {FACULTY_COLUMNS} FROM faculty WHERE {where} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
                [*parameters, page_size, (page - 1) * page_size],
            ).fetchall()
    return FacultyList(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=FacultyResponse, status_code=201)
def create_faculty(payload: FacultyCreate, admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        with connect_database() as connection:
            with connection.transaction():
                with connection.cursor(row_factory=dict_row) as cursor:
                    return cursor.execute(
                        f"INSERT INTO faculty (admin_id, name, role, email, is_active, password_hash) VALUES (%s, %s, %s, %s, %s, %s) RETURNING {FACULTY_COLUMNS}",
                        (admin.id, payload.name, payload.role, payload.email, payload.is_active, password_hasher.hash(payload.password.get_secret_value())),
                    ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "A faculty account with this email already exists.") from None


@router.put("/{record_id}", response_model=FacultyResponse)
def update_faculty(record_id: int, payload: FacultyUpdate, admin: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try:
        with connect_database() as connection:
            with connection.transaction():
                with connection.cursor(row_factory=dict_row) as cursor:
                    faculty = cursor.execute(
                        f"""UPDATE faculty SET name=%s, role=%s, email=%s, is_active=%s, password_hash=COALESCE(%s, password_hash),
                        updated_at=CURRENT_TIMESTAMP WHERE id=%s AND admin_id=%s RETURNING {FACULTY_COLUMNS}""",
                        (payload.name, payload.role, payload.email, payload.is_active,
                         password_hasher.hash(payload.password.get_secret_value()) if payload.password is not None else None,
                         record_id, admin.id),
                    ).fetchone()
                    if faculty is None:
                        raise HTTPException(404, "Faculty account not found.")
                    return faculty
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "A faculty account with this email already exists.") from None