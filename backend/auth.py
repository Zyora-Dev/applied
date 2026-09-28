import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, SecretStr

from database import connect_database


SESSION_SECONDS = 8 * 60 * 60
password_hasher = PasswordHasher()
dummy_password_hash = password_hasher.hash(secrets.token_urlsafe(32))
bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def initialize_auth_tables(connection: psycopg.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY,
            admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_login_limits (
            client_key TEXT PRIMARY KEY,
            window_started TIMESTAMPTZ NOT NULL,
            attempts INTEGER NOT NULL
        )
        """
    )


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: SecretStr = Field(min_length=1, max_length=1024)


class AdminResponse(BaseModel):
    id: int
    email: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = SESSION_SECONDS
    admin: AdminResponse


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid credentials or session.",
        headers={"WWW-Authenticate": "Bearer", "Cache-Control": "no-store"},
    )


def session_hash(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    token = credentials.credentials
    if len(token) != 43 or any(
        character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
        for character in token
    ):
        raise unauthorized()
    return hashlib.sha256(token.encode()).hexdigest()


def require_admin(credentials: Credentials, response: Response) -> AdminResponse:
    token_hash = session_hash(credentials)
    with connect_database() as connection:
        admin = connection.execute(
            """
            SELECT admins.id, admins.email
            FROM admin_sessions JOIN admins ON admins.id = admin_sessions.admin_id
            WHERE token_hash = %s AND expires_at > CURRENT_TIMESTAMP
            """,
            (token_hash,),
        ).fetchone()
    if admin is None:
        raise unauthorized()
    response.headers["Cache-Control"] = "no-store"
    return AdminResponse(id=admin[0], email=admin[1])


login_router = APIRouter(prefix="/admin", tags=["Admin"])
admin_router = APIRouter(
    prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)]
)


@login_router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response) -> LoginResponse:
    client_host = request.client.host if request.client else "unknown"
    client_key = hashlib.sha256(client_host.encode()).hexdigest()
    with connect_database() as connection:
        connection.execute(
            "DELETE FROM admin_login_limits WHERE window_started < CURRENT_TIMESTAMP - INTERVAL '1 day'"
        )
        attempts = connection.execute(
            """
            INSERT INTO admin_login_limits (client_key, window_started, attempts)
            VALUES (%s, CURRENT_TIMESTAMP, 1)
            ON CONFLICT (client_key) DO UPDATE SET
                attempts = CASE
                    WHEN admin_login_limits.window_started <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
                    THEN 1 ELSE admin_login_limits.attempts + 1 END,
                window_started = CASE
                    WHEN admin_login_limits.window_started <= CURRENT_TIMESTAMP - INTERVAL '1 minute'
                    THEN CURRENT_TIMESTAMP ELSE admin_login_limits.window_started END
            RETURNING attempts
            """,
            (client_key,),
        ).fetchone()[0]
    if attempts > 10:
        raise HTTPException(status_code=429, detail="Too many login attempts.", headers={"Retry-After": "60"})
    try:
        email = validate_email(payload.email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        email = ""
    with connect_database() as connection:
        admin = connection.execute(
            "SELECT id, email, password_hash FROM admins WHERE email = %s", (email,)
        ).fetchone()
    stored_hash = admin[2] if admin else dummy_password_hash
    try:
        password_hasher.verify(stored_hash, payload.password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise unauthorized() from None
    if admin is None:
        raise unauthorized()
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=SESSION_SECONDS)
    with connect_database() as connection:
        connection.execute("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
        connection.execute(
            "INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (%s, %s, %s)",
            (token_hash, admin[0], expires_at),
        )
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(access_token=token, admin=AdminResponse(id=admin[0], email=admin[1]))


@admin_router.get("/me", response_model=AdminResponse)
def current_admin(admin: Annotated[AdminResponse, Depends(require_admin)]) -> AdminResponse:
    return admin


@admin_router.post("/logout", status_code=204)
def logout(credentials: Credentials) -> Response:
    with connect_database() as connection:
        connection.execute(
            "DELETE FROM admin_sessions WHERE token_hash = %s", (session_hash(credentials),)
        )
    return Response(status_code=204, headers={"Cache-Control": "no-store"})