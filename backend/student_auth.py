import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import psycopg
from argon2.exceptions import InvalidHashError, VerificationError
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from psycopg.rows import dict_row
from pydantic import BaseModel

from auth import Credentials, LoginRequest, SESSION_SECONDS, dummy_password_hash, password_hasher, session_hash, unauthorized
from database import connect_database
from students import STUDENT_COLUMNS, StudentCreate, StudentResponse, read_week_progress


router = APIRouter(prefix="/student", tags=["Student access"])


def initialize_student_auth_tables(connection: psycopg.Connection) -> None:
    connection.execute("""CREATE TABLE IF NOT EXISTS student_sessions (
        token_hash TEXT PRIMARY KEY,
        student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        student_updated_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
    )""")
    connection.execute("CREATE INDEX IF NOT EXISTS student_sessions_student_idx ON student_sessions (student_id)")
    connection.execute("""CREATE TABLE IF NOT EXISTS student_auth_limits (
        client_key TEXT PRIMARY KEY,
        window_started TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL
    )""")


def enrollment_admin(connection: psycopg.Connection) -> int:
    configured = os.environ.get("STUDENT_REGISTRATION_ADMIN_ID", "").strip()
    if configured:
        if not configured.isascii() or not configured.isdigit() or len(configured) > 18:
            raise HTTPException(503, "Student access is not configured.")
        owners = connection.execute("SELECT id FROM admins WHERE id=%s", (int(configured),)).fetchall()
    else:
        owners = connection.execute("SELECT id FROM admins ORDER BY id LIMIT 2").fetchall()
    if len(owners) != 1:
        raise HTTPException(503, "Student access is not configured.")
    return owners[0][0]


def rate_limit(request: Request, action: str, limit: int) -> None:
    host = request.client.host if request.client else "unknown"
    client_key = hashlib.sha256(f"{action}:{host}".encode()).hexdigest()
    with connect_database() as connection:
        connection.execute("DELETE FROM student_auth_limits WHERE window_started < CURRENT_TIMESTAMP - INTERVAL '1 day'")
        attempts = connection.execute("""INSERT INTO student_auth_limits (client_key, window_started, attempts)
            VALUES (%s, CURRENT_TIMESTAMP, 1)
            ON CONFLICT (client_key) DO UPDATE SET
                attempts = CASE WHEN student_auth_limits.window_started <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
                    THEN 1 ELSE student_auth_limits.attempts + 1 END,
                window_started = CASE WHEN student_auth_limits.window_started <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
                    THEN CURRENT_TIMESTAMP ELSE student_auth_limits.window_started END
            RETURNING attempts""", (client_key,)).fetchone()[0]
    if attempts > limit:
        raise HTTPException(429, "Too many attempts. Please try again in a minute.", headers={"Retry-After": "60", "Cache-Control": "no-store"})


class StudentLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = SESSION_SECONDS
    student: StudentResponse


def create_session(connection: psycopg.Connection, student: dict) -> StudentLoginResponse:
    token = secrets.token_urlsafe(32)
    connection.execute("DELETE FROM student_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
    connection.execute("""INSERT INTO student_sessions (token_hash, student_id, student_updated_at, expires_at)
        VALUES (%s, %s, %s, %s)""", (
        hashlib.sha256(token.encode()).hexdigest(), student["id"], student["updated_at"],
        datetime.now(timezone.utc) + timedelta(seconds=SESSION_SECONDS),
    ))
    return StudentLoginResponse(access_token=token, student=StudentResponse(**student))


def require_student(credentials: Credentials, response: Response) -> StudentResponse:
    token_hash = session_hash(credentials)
    with connect_database() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            student = cursor.execute(f"""SELECT {STUDENT_COLUMNS} FROM students
                WHERE EXISTS (SELECT 1 FROM student_sessions
                    WHERE student_sessions.student_id=students.id AND token_hash=%s
                    AND expires_at > CURRENT_TIMESTAMP AND student_updated_at=students.updated_at)""",
                (token_hash,),
            ).fetchone()
    if student is None:
        raise unauthorized()
    response.headers["Cache-Control"] = "no-store"
    return StudentResponse(**student)


@router.post("/register", response_model=StudentLoginResponse, status_code=201)
def register(payload: StudentCreate, request: Request, response: Response):
    rate_limit(request, "register", 5)
    response.headers["Cache-Control"] = "no-store"
    try:
        with connect_database() as connection:
            admin_id = enrollment_admin(connection)
            with connection.cursor(row_factory=dict_row) as cursor:
                student = cursor.execute(f"""INSERT INTO students
                    (admin_id, name, student_id, email, mobile, college, degree, stream, github_url, linkedin_url, password_hash)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {STUDENT_COLUMNS}""",
                    [admin_id, *payload.model_dump(exclude={"password"}).values(), password_hasher.hash(payload.password.get_secret_value())],
                ).fetchone()
            return create_session(connection, student)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "An account with this student ID or email already exists. Sign in or contact your administrator.") from None


@router.post("/login", response_model=StudentLoginResponse)
def login(payload: LoginRequest, request: Request, response: Response):
    rate_limit(request, "login", 10)
    response.headers["Cache-Control"] = "no-store"
    try:
        email = validate_email(payload.email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        email = ""
    with connect_database() as connection:
        admin_id = enrollment_admin(connection)
        with connection.cursor(row_factory=dict_row) as cursor:
            student = cursor.execute(f"SELECT {STUDENT_COLUMNS}, password_hash FROM students WHERE admin_id=%s AND email=%s FOR UPDATE",
                (admin_id, email),
            ).fetchone()
        stored_hash = student["password_hash"] if student and student["password_hash"] else dummy_password_hash
        try:
            password_hasher.verify(stored_hash, payload.password.get_secret_value())
        except (VerificationError, InvalidHashError):
            raise unauthorized() from None
        if student is None or not student["password_hash"]:
            raise unauthorized()
        del student["password_hash"]
        return create_session(connection, student)


@router.get("/me", response_model=StudentResponse)
def current_student(student: Annotated[StudentResponse, Depends(require_student)]):
    return student


@router.get("/progress")
def current_progress(student: Annotated[StudentResponse, Depends(require_student)]):
    with connect_database() as connection:
        return {"weeks": read_week_progress(connection, student.id)}


@router.post("/logout", status_code=204)
def logout(credentials: Credentials):
    token_hash = session_hash(credentials)
    with connect_database() as connection:
        connection.execute("DELETE FROM student_sessions WHERE token_hash=%s", (token_hash,))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})