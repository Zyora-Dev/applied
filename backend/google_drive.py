import base64
import hashlib
import json
import os
import secrets
from http.client import HTTPException as HTTPClientError
from pathlib import Path
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request as URLRequest, build_opener

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from admin_auth import PRIVATE_HEADERS, bearer, token_digest
from database import connect_database
from student_auth import StudentAccount, require_student


router = APIRouter(prefix="/student/google-drive", tags=["Student Google Drive"])
Student = Annotated[StudentAccount, Depends(require_student)]
Credentials = Annotated[HTTPAuthorizationCredentials, Depends(bearer)]
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
LOCAL_CALLBACK = "http://localhost:3300/api/student/google-drive/callback"


class CallbackInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    code: SecretStr | None = Field(default=None, max_length=4096)
    error: str | None = Field(default=None, max_length=256)


class ConnectionStatus(BaseModel):
    connected: bool


def unavailable():
    return HTTPException(503, "Google Drive connection is temporarily unavailable.", headers=PRIVATE_HEADERS)


def oauth_config():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()
    local = os.environ.get("APP_ENV", "local") == "local"
    if not redirect_uri and local:
        redirect_uri = LOCAL_CALLBACK
    parsed = urlsplit(redirect_uri)
    if not client_id or not client_secret or not parsed.hostname or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise unavailable()
    if parsed.scheme != "https" and not (local and redirect_uri == LOCAL_CALLBACK):
        raise unavailable()
    return client_id, client_secret, redirect_uri


def drive_cipher():
    configured = os.environ.get("GOOGLE_DRIVE_ENCRYPTION_KEY")
    if configured:
        return Fernet(configured.encode("ascii"))
    if os.environ.get("APP_ENV", "local") != "local":
        raise ValueError("Google Drive encryption key is not configured")
    path = Path(__file__).parent / ".secrets" / "google-drive.key"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(descriptor, "wb") as key_file:
            key_file.write(Fernet.generate_key())
    return Fernet(path.read_bytes())


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def exchange_code(code, verifier):
    client_id, client_secret, redirect_uri = oauth_config()
    return request_token({
        "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri,
        "grant_type": "authorization_code", "code": code, "code_verifier": verifier,
    })


def request_token(fields):
    request = URLRequest("https://oauth2.googleapis.com/token", data=urlencode(fields).encode(),
                         headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            content = response.read(65_537)
        if len(content) > 65_536:
            raise ValueError()
        result = json.loads(content)
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except HTTPError as error:
        try:
            content = error.read(65_537)
            result = json.loads(content) if len(content) <= 65_536 else None
        except (OSError, HTTPClientError, ValueError):
            result = None
        finally:
            error.close()
        if fields.get("grant_type") == "refresh_token" and isinstance(result, dict) and result.get("error") == "invalid_grant":
            raise HTTPException(409, "Reconnect Google Drive to select a notebook.", headers=PRIVATE_HEADERS) from None
        raise unavailable() from None
    except (OSError, URLError, HTTPClientError, ValueError):
        raise unavailable() from None


def refresh_access(student_id):
    with connect_database() as connection:
        record = connection.execute(
            "SELECT refresh_token_encrypted FROM student_google_drive WHERE student_id=%s",
            (student_id,),
        ).fetchone()
    if not record or not record["refresh_token_encrypted"]:
        raise HTTPException(409, "Connect Google Drive to select a notebook.", headers=PRIVATE_HEADERS)
    try:
        refresh_token = drive_cipher().decrypt(record["refresh_token_encrypted"].encode()).decode()
        client_id, client_secret, _ = oauth_config()
        result = request_token({"client_id": client_id, "client_secret": client_secret,
                                "grant_type": "refresh_token", "refresh_token": refresh_token})
    except (OSError, ValueError, InvalidToken, UnicodeError):
        raise unavailable() from None
    access_token = result.get("access_token")
    expires_in = result.get("expires_in")
    scope = result.get("scope", DRIVE_SCOPE)
    token_type = result.get("token_type")
    if (not isinstance(access_token, str) or not access_token or len(access_token) > 16_384
            or not isinstance(token_type, str) or token_type.lower() != "bearer"
            or type(expires_in) is not int or not 0 < expires_in <= 86_400
            or not isinstance(scope, str) or DRIVE_SCOPE not in scope.split()):
        raise unavailable()
    return access_token, expires_in, record["refresh_token_encrypted"]


@router.post("/picker")
def picker_session(student: Student, credentials: Credentials, response: Response):
    access_token, expires_in, encrypted = refresh_access(student.id)
    api_key = os.environ.get("GOOGLE_PICKER_API_KEY", "").strip()
    project_number = os.environ.get("GOOGLE_PROJECT_NUMBER", "").strip()
    if not api_key or not project_number.isascii() or not project_number.isdigit():
        raise unavailable()
    with connect_database() as connection:
        current = connection.execute(
            """SELECT 1 FROM student_google_drive WHERE student_id=%s AND refresh_token_encrypted=%s
            AND EXISTS (SELECT 1 FROM student_sessions JOIN students ON students.id=student_sessions.student_id
                WHERE student_sessions.student_id=%s AND token_hash=%s AND student_sessions.expires_at > clock_timestamp()
                AND student_updated_at=students.updated_at AND students.is_active=TRUE AND students.deleted_at IS NULL)""",
            (student.id, encrypted, student.id, token_digest(credentials.credentials)),
        ).fetchone()
    if not current:
        raise HTTPException(409, "Connection changed. Please try again.", headers=PRIVATE_HEADERS)
    response.headers.update(PRIVATE_HEADERS)
    return {"access_token": access_token, "expires_in": expires_in, "api_key": api_key, "project_number": project_number}


@router.get("", response_model=ConnectionStatus)
def connection_status(student: Student, response: Response):
    with connect_database() as connection:
        record = connection.execute(
            "SELECT refresh_token_encrypted IS NOT NULL AS connected FROM student_google_drive WHERE student_id=%s",
            (student.id,),
        ).fetchone()
    response.headers.update(PRIVATE_HEADERS)
    return {"connected": bool(record and record["connected"])}


@router.post("/connect")
def begin_connection(student: Student, credentials: Credentials, response: Response):
    client_id, _, redirect_uri = oauth_config()
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    try:
        encrypted = drive_cipher().encrypt(verifier.encode()).decode()
    except (OSError, ValueError, UnicodeError):
        raise unavailable() from None
    with connect_database() as connection:
        connection.execute(
            """INSERT INTO student_google_drive (student_id, state_hash, session_hash, verifier_encrypted, expires_at)
            VALUES (%s, %s, %s, %s, clock_timestamp() + interval '10 minutes')
            ON CONFLICT (student_id) DO UPDATE SET state_hash=EXCLUDED.state_hash,
            session_hash=EXCLUDED.session_hash, verifier_encrypted=EXCLUDED.verifier_encrypted,
            expires_at=EXCLUDED.expires_at""",
            (student.id, token_digest(state), token_digest(credentials.credentials), encrypted),
        )
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    response.headers.update(PRIVATE_HEADERS)
    return {"state": state, "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": DRIVE_SCOPE, "access_type": "offline", "prompt": "consent select_account",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    })}


@router.post("/callback", response_model=ConnectionStatus)
def finish_connection(payload: CallbackInput, student: Student, credentials: Credentials, response: Response):
    state_hash = token_digest(payload.state)
    session_hash = token_digest(credentials.credentials)
    with connect_database() as connection:
        attempt = connection.execute(
            """SELECT verifier_encrypted FROM student_google_drive WHERE student_id=%s
            AND state_hash=%s AND session_hash=%s AND expires_at > clock_timestamp()
            AND verifier_encrypted IS NOT NULL FOR UPDATE""",
            (student.id, state_hash, session_hash),
        ).fetchone()
        if attempt:
            connection.execute("UPDATE student_google_drive SET verifier_encrypted=NULL WHERE student_id=%s", (student.id,))
    if not attempt:
        raise HTTPException(400, "Connection attempt expired or invalid. Please try again.", headers=PRIVATE_HEADERS)
    if payload.error or payload.code is None or not payload.code.get_secret_value():
        raise HTTPException(400, "Google connection was not completed.", headers=PRIVATE_HEADERS)
    try:
        cipher = drive_cipher()
        verifier = cipher.decrypt(attempt["verifier_encrypted"].encode()).decode()
        result = exchange_code(payload.code.get_secret_value(), verifier)
        scope = result.get("scope")
        refresh_token = result.get("refresh_token")
        if not isinstance(scope, str) or DRIVE_SCOPE not in scope.split():
            raise HTTPException(400, "Google Drive permission was not granted.", headers=PRIVATE_HEADERS)
        if not isinstance(refresh_token, str) or not refresh_token or len(refresh_token) > 16_384:
            raise HTTPException(400, "Reconnect Google Drive and grant offline access.", headers=PRIVATE_HEADERS)
        encrypted = cipher.encrypt(refresh_token.encode()).decode()
    except (OSError, ValueError, InvalidToken, UnicodeError):
        raise unavailable() from None
    with connect_database() as connection:
        saved = connection.execute(
            """UPDATE student_google_drive SET refresh_token_encrypted=%s, connected_at=clock_timestamp(),
            state_hash=NULL, session_hash=NULL, expires_at=NULL WHERE student_id=%s
            AND state_hash=%s AND session_hash=%s AND expires_at > clock_timestamp()
            AND EXISTS (SELECT 1 FROM student_sessions JOIN students ON students.id=student_sessions.student_id
                WHERE student_sessions.student_id=%s AND token_hash=%s AND student_sessions.expires_at > clock_timestamp()
                AND student_updated_at=students.updated_at AND students.is_active=TRUE AND students.deleted_at IS NULL)
            RETURNING student_id""",
            (encrypted, student.id, state_hash, session_hash, student.id, session_hash),
        ).fetchone()
    if not saved:
        raise HTTPException(400, "Connection attempt expired or replaced. Please try again.", headers=PRIVATE_HEADERS)
    response.headers.update(PRIVATE_HEADERS)
    return {"connected": True}


@router.delete("", status_code=204)
def disconnect(student: Student, response: Response):
    with connect_database() as connection:
        connection.execute("DELETE FROM student_google_drive WHERE student_id=%s", (student.id,))
    response.headers.update(PRIVATE_HEADERS)