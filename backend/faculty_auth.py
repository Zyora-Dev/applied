import secrets
from datetime import datetime
from typing import Annotated

from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from admin_auth import LoginInput, PRIVATE_HEADERS, bearer, check_login_limit, dummy_password_hash, password_hasher, token_digest, unauthorized
from database import connect_database


router = APIRouter(prefix="/faculty", tags=["Faculty authentication"])


class FacultyAccount(BaseModel):
    id: int
    admin_id: int
    name: str
    email: str
    role: str


class FacultyLoginResult(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    faculty: FacultyAccount


def require_faculty(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or len(credentials.credentials) != 43:
        raise unauthorized()
    with connect_database() as connection:
        record = connection.execute(
            """SELECT faculty.* FROM faculty_sessions JOIN faculty ON faculty.id=faculty_sessions.faculty_id
            WHERE token_hash=%s AND expires_at > clock_timestamp()
            AND faculty_updated_at=faculty.updated_at AND faculty.is_active=TRUE
            AND faculty.deleted_at IS NULL AND faculty.admin_id IS NOT NULL""",
            (token_digest(credentials.credentials),),
        ).fetchone()
    if record is None:
        raise unauthorized("Invalid or expired session.")
    return FacultyAccount.model_validate(record)


Faculty = Annotated[FacultyAccount, Depends(require_faculty)]


@router.post("/login", response_model=FacultyLoginResult)
def login(payload: LoginInput, request: Request, response: Response):
    email = str(payload.email).strip().lower()
    check_login_limit(request, email, "faculty:")
    with connect_database() as connection:
        record = connection.execute("SELECT * FROM faculty WHERE lower(email)=%s FOR UPDATE", (email,)).fetchone()
        try:
            valid = password_hasher.verify(record["password_hash"] if record else dummy_password_hash, payload.password.get_secret_value())
        except (VerificationError, InvalidHashError):
            valid = False
        if not valid or record is None or not record["is_active"] or record["deleted_at"] is not None or record["admin_id"] is None:
            raise unauthorized("Invalid email or password.")
        connection.execute("DELETE FROM faculty_sessions WHERE expires_at <= clock_timestamp()")
        token = secrets.token_urlsafe(32)
        session = connection.execute(
            """INSERT INTO faculty_sessions (token_hash, faculty_id, faculty_updated_at, expires_at)
            VALUES (%s,%s,%s,clock_timestamp() + interval '8 hours') RETURNING expires_at""",
            (token_digest(token), record["id"], record["updated_at"]),
        ).fetchone()
    response.headers.update(PRIVATE_HEADERS)
    return FacultyLoginResult(access_token=token, expires_at=session["expires_at"], faculty=FacultyAccount.model_validate(record))


@router.get("/me", response_model=FacultyAccount)
def me(faculty: Faculty, response: Response):
    response.headers.update(PRIVATE_HEADERS)
    return faculty


@router.post("/logout", status_code=204)
def logout(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or len(credentials.credentials) != 43:
        raise unauthorized()
    with connect_database() as connection:
        connection.execute("DELETE FROM faculty_sessions WHERE token_hash=%s", (token_digest(credentials.credentials),))
    return Response(status_code=204, headers=PRIVATE_HEADERS)