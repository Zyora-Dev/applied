import secrets
from datetime import datetime
from typing import Annotated

from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from admin_auth import LoginInput, PasswordChangeInput, PRIVATE_HEADERS, bearer, check_login_limit, dummy_password_hash, password_hasher, token_digest, unauthorized
from database import connect_database


router = APIRouter(prefix="/student", tags=["Student authentication"])


class InvitationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: SecretStr = Field(min_length=43, max_length=43)


class PasswordSetupInput(InvitationInput):
    password: SecretStr = Field(min_length=8, max_length=128)
    confirm_password: SecretStr = Field(min_length=8, max_length=128)


def valid_invitation(connection, token):
    digest = token_digest(token)
    student = connection.execute(
        """SELECT students.* FROM students JOIN student_invitations ON student_invitations.student_id=students.id
        WHERE token_hash=%s FOR UPDATE OF students""", (digest,),
    ).fetchone()
    invitation = connection.execute(
        """SELECT expires_at FROM student_invitations WHERE token_hash=%s
        AND expires_at > clock_timestamp() AND student_updated_at=%s""",
        (digest, student["updated_at"] if student else None),
    ).fetchone()
    if not student or not invitation or student["is_active"] or student["deleted_at"] is not None:
        raise HTTPException(400, "This invitation is invalid or expired. Ask your administrator for a new invitation.", headers=PRIVATE_HEADERS)
    return student, invitation


@router.post("/invitation")
def check_invitation(payload: InvitationInput, request: Request, response: Response):
    check_login_limit(request, token_digest(payload.token.get_secret_value()), "invitation:", ip_limit=300)
    with connect_database() as connection:
        student, invitation = valid_invitation(connection, payload.token.get_secret_value())
    response.headers.update(PRIVATE_HEADERS)
    return {"name": student["name"], "email": student["email"], "expires_at": invitation["expires_at"]}


@router.post("/setup-password", status_code=204)
def setup_password(payload: PasswordSetupInput, request: Request):
    check_login_limit(request, token_digest(payload.token.get_secret_value()), "invitation:", ip_limit=300)
    if payload.password.get_secret_value() != payload.confirm_password.get_secret_value():
        raise HTTPException(422, "Passwords do not match.", headers=PRIVATE_HEADERS)
    with connect_database() as connection:
        student, _ = valid_invitation(connection, payload.token.get_secret_value())
        connection.execute("UPDATE students SET password_hash=%s, is_active=TRUE WHERE id=%s", (password_hasher.hash(payload.password.get_secret_value()), student["id"]))
        connection.execute("DELETE FROM student_invitations WHERE student_id=%s", (student["id"],))
        connection.execute("DELETE FROM student_sessions WHERE student_id=%s", (student["id"],))
    return Response(status_code=204, headers=PRIVATE_HEADERS)


class StudentAccount(BaseModel):
    id: int
    name: str
    email: str
    student_id: str
    college: str
    degree: str
    year: int


class StudentLoginResult(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    student: StudentAccount


def require_student(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or len(credentials.credentials) != 43:
        raise unauthorized()
    with connect_database() as connection:
        student = connection.execute(
            """SELECT students.* FROM student_sessions JOIN students ON students.id=student_sessions.student_id
            WHERE token_hash=%s AND expires_at > clock_timestamp()
            AND student_updated_at=students.updated_at AND students.is_active=TRUE AND students.deleted_at IS NULL""",
            (token_digest(credentials.credentials),),
        ).fetchone()
    if student is None:
        raise unauthorized("Invalid or expired session.")
    return StudentAccount.model_validate(student)


@router.post("/login", response_model=StudentLoginResult)
def login(payload: LoginInput, request: Request, response: Response):
    email = str(payload.email).strip().lower()
    check_login_limit(request, email, "student:")
    with connect_database() as connection:
        student = connection.execute("SELECT * FROM students WHERE lower(email)=%s FOR UPDATE", (email,)).fetchone()
        try:
            valid = password_hasher.verify(student["password_hash"] if student else dummy_password_hash, payload.password.get_secret_value())
        except (VerificationError, InvalidHashError):
            valid = False
        if not valid or student is None or not student["is_active"] or student["deleted_at"] is not None:
            raise unauthorized("Invalid email or password.")
        connection.execute("DELETE FROM student_sessions WHERE expires_at <= clock_timestamp()")
        token = secrets.token_urlsafe(32)
        session = connection.execute(
            """INSERT INTO student_sessions (token_hash, student_id, student_updated_at, expires_at)
            VALUES (%s, %s, %s, clock_timestamp() + interval '8 hours') RETURNING expires_at""",
            (token_digest(token), student["id"], student["updated_at"]),
        ).fetchone()
    response.headers.update(PRIVATE_HEADERS)
    return StudentLoginResult(access_token=token, expires_at=session["expires_at"], student=StudentAccount.model_validate(student))


@router.get("/me", response_model=StudentAccount)
def me(student: Annotated[StudentAccount, Depends(require_student)], response: Response):
    response.headers.update(PRIVATE_HEADERS)
    return student


@router.put("/password", status_code=204)
def change_password(payload: PasswordChangeInput, request: Request,
                    student: Annotated[StudentAccount, Depends(require_student)],
                    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None:
        raise unauthorized()
    check_login_limit(request, student.email, "student:")
    new_password = payload.new_password.get_secret_value()
    if new_password != payload.confirm_password.get_secret_value():
        raise HTTPException(422, "New passwords do not match.", headers=PRIVATE_HEADERS)
    if new_password == payload.current_password.get_secret_value():
        raise HTTPException(422, "Choose a different new password.", headers=PRIVATE_HEADERS)
    with connect_database() as connection:
        record = connection.execute(
            """SELECT * FROM students WHERE id=%s FOR UPDATE""", (student.id,),
        ).fetchone()
        session = connection.execute(
            """SELECT 1 FROM student_sessions WHERE student_id=%s AND token_hash=%s
            AND expires_at > clock_timestamp() AND student_updated_at=%s""",
            (student.id, token_digest(credentials.credentials), record["updated_at"] if record else None),
        ).fetchone()
        if record is None or session is None or not record["is_active"] or record["deleted_at"] is not None:
            raise unauthorized()
        try:
            valid = password_hasher.verify(record["password_hash"], payload.current_password.get_secret_value())
        except (VerificationError, InvalidHashError):
            valid = False
        if not valid:
            raise HTTPException(400, "Current password is incorrect.", headers=PRIVATE_HEADERS)
        connection.execute("UPDATE students SET password_hash=%s WHERE id=%s", (password_hasher.hash(new_password), student.id))
        connection.execute("DELETE FROM student_sessions WHERE student_id=%s", (student.id,))
    return Response(status_code=204, headers=PRIVATE_HEADERS)


@router.post("/logout", status_code=204)
def logout(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or len(credentials.credentials) != 43:
        raise unauthorized()
    with connect_database() as connection:
        connection.execute("DELETE FROM student_sessions WHERE token_hash=%s", (token_digest(credentials.credentials),))
    return Response(status_code=204, headers=PRIVATE_HEADERS)