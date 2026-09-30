import hashlib
import secrets
from datetime import datetime
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr

from database import connect_database


router = APIRouter(prefix="/admin", tags=["Admin authentication"])
bearer = HTTPBearer(auto_error=False)
password_hasher = PasswordHasher()
dummy_password_hash = password_hasher.hash(secrets.token_urlsafe(32))
PRIVATE_HEADERS = {"Cache-Control": "no-store"}


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=1024)


class AdminAccount(BaseModel):
    id: int
    email: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PasswordChangeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: SecretStr = Field(min_length=1, max_length=1024)
    new_password: SecretStr = Field(min_length=8, max_length=128)
    confirm_password: SecretStr = Field(min_length=8, max_length=128)


class LoginResult(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    admin: AdminAccount


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def unauthorized(detail: str = "Authentication required.") -> HTTPException:
    return HTTPException(
        status_code=401,
        detail=detail,
        headers={**PRIVATE_HEADERS, "WWW-Authenticate": "Bearer"},
    )


def check_login_limit(request: Request, email: str, namespace: str = "", *, ip_limit: int = 300) -> None:
    host = request.client.host if request.client else "unknown"
    limited = False
    with connect_database() as connection:
        connection.execute(
            "DELETE FROM admin_login_limits WHERE window_started_at < now() - interval '1 day'"
        )
        for bucket in (f"ip:{host}", f"email:{email}"):
            result = connection.execute(
                """
                INSERT INTO admin_login_limits (bucket_hash, attempts)
                VALUES (%s, 1)
                ON CONFLICT (bucket_hash) DO UPDATE SET
                    attempts = CASE
                        WHEN admin_login_limits.window_started_at <= clock_timestamp() - interval '1 minute'
                        THEN 1 ELSE admin_login_limits.attempts + 1 END,
                    window_started_at = CASE
                        WHEN admin_login_limits.window_started_at <= clock_timestamp() - interval '1 minute'
                        THEN clock_timestamp() ELSE admin_login_limits.window_started_at END
                RETURNING attempts
                """,
                (token_digest(namespace + bucket),),
            ).fetchone()
            limited = limited or result["attempts"] > (ip_limit if bucket.startswith("ip:") else 10)
    if limited:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again in one minute.",
            headers={**PRIVATE_HEADERS, "Retry-After": "60"},
        )


def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if credentials is None or len(credentials.credentials) != 43:
        raise unauthorized()
    with connect_database() as connection:
        admin = connection.execute(
            """
            SELECT admins.id, admins.email, admins.is_active,
                   admins.created_at, admins.updated_at
            FROM admin_sessions
            JOIN admins ON admins.id = admin_sessions.admin_id
            WHERE admin_sessions.token_hash = %s
              AND admin_sessions.expires_at > clock_timestamp()
              AND admin_sessions.admin_updated_at = admins.updated_at
              AND admins.is_active = TRUE AND admins.deleted_at IS NULL
            """,
            (token_digest(credentials.credentials),),
        ).fetchone()
    if admin is None:
        raise unauthorized("Invalid or expired session.")
    return admin


@router.post("/login", response_model=LoginResult)
def login(payload: LoginInput, request: Request, response: Response):
    email = str(payload.email).strip().lower()
    check_login_limit(request, email)
    with connect_database() as connection:
        admin = connection.execute(
            "SELECT * FROM admins WHERE lower(email) = %s FOR UPDATE",
            (email,),
        ).fetchone()
        stored_hash = admin["password_hash"] if admin else dummy_password_hash
        try:
            password_valid = password_hasher.verify(
                stored_hash, payload.password.get_secret_value()
            )
        except (VerificationError, InvalidHashError):
            password_valid = False
        if not password_valid or admin is None or not admin["is_active"] or admin["deleted_at"] is not None:
            raise unauthorized("Invalid email or password.")
        connection.execute(
            "DELETE FROM admin_sessions WHERE expires_at <= clock_timestamp()"
        )
        token = secrets.token_urlsafe(32)
        session = connection.execute(
            """
            INSERT INTO admin_sessions (token_hash, admin_id, admin_updated_at, expires_at)
            VALUES (%s, %s, %s, clock_timestamp() + interval '8 hours')
            RETURNING expires_at
            """,
            (token_digest(token), admin["id"], admin["updated_at"]),
        ).fetchone()
    response.headers.update(PRIVATE_HEADERS)
    return LoginResult(
        access_token=token,
        expires_at=session["expires_at"],
        admin=AdminAccount.model_validate(admin),
    )


@router.get("/me", response_model=AdminAccount)
def me(admin: Annotated[dict, Depends(require_admin)], response: Response):
    response.headers.update(PRIVATE_HEADERS)
    return admin


@router.put("/settings/password", status_code=204)
def change_password(payload: PasswordChangeInput, request: Request, admin: Annotated[dict, Depends(require_admin)]):
    check_login_limit(request, admin["email"])
    new_password = payload.new_password.get_secret_value()
    if new_password != payload.confirm_password.get_secret_value():
        raise HTTPException(422, "New passwords do not match.", headers=PRIVATE_HEADERS)
    if new_password == payload.current_password.get_secret_value():
        raise HTTPException(422, "Choose a different new password.", headers=PRIVATE_HEADERS)
    with connect_database() as connection:
        record = connection.execute("SELECT * FROM admins WHERE id=%s FOR UPDATE", (admin["id"],)).fetchone()
        if record is None or record["updated_at"] != admin["updated_at"] or not record["is_active"] or record["deleted_at"] is not None:
            raise unauthorized()
        try:
            valid = password_hasher.verify(record["password_hash"], payload.current_password.get_secret_value())
        except (VerificationError, InvalidHashError):
            valid = False
        if not valid:
            raise HTTPException(400, "Current password is incorrect.", headers=PRIVATE_HEADERS)
        connection.execute("UPDATE admins SET password_hash=%s WHERE id=%s", (password_hasher.hash(new_password), admin["id"]))
        connection.execute("DELETE FROM admin_sessions WHERE admin_id=%s", (admin["id"],))
    return Response(status_code=204, headers=PRIVATE_HEADERS)


@router.post("/logout", status_code=204)
def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    if credentials is None or len(credentials.credentials) != 43:
        raise unauthorized()
    with connect_database() as connection:
        connection.execute(
            "DELETE FROM admin_sessions WHERE token_hash = %s",
            (token_digest(credentials.credentials),),
        )
    return Response(status_code=204, headers=PRIVATE_HEADERS)