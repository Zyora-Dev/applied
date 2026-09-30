import hashlib
import json
from datetime import date, datetime, time, timedelta
from http.client import HTTPException as HTTPClientError
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as URLRequest, build_opener
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import nbformat
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from admin_auth import PRIVATE_HEADERS, token_digest
from database import connect_database
from google_drive import Credentials, NoRedirect, Student, refresh_access
from programme import WeekNumber


router = APIRouter(prefix="/student/submissions", tags=["Student submissions"])
MAX_BYTES = 2 * 1024 * 1024
MAX_ATTEMPTS = 20
RECEIPT_FIELDS = "id, week, kind, filename, sha256, submitted_at, octet_length(notebook) AS size_bytes"
SubmissionKind = Literal["practical", "homework"]
REVIEW_SELECT = """(SELECT json_build_object('id', submission_reviews.id, 'score', score, 'feedback', feedback,
    'reviewed_at', reviewed_at, 'faculty_name', faculty.name) FROM submission_reviews
    JOIN faculty ON faculty.id=submission_reviews.faculty_id
    WHERE submission_reviews.submission_id=student_submissions.id
    ORDER BY reviewed_at DESC, submission_reviews.id DESC LIMIT 1) AS review"""


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,256}$")
    request_id: UUID
    kind: SubmissionKind = "homework"


def failure(status, detail):
    return HTTPException(status, detail, headers=PRIVATE_HEADERS)


def access(connection, student_id, credentials, week, lock=False):
    student = connection.execute(
        "SELECT admin_id FROM students WHERE id=%s AND is_active=TRUE AND deleted_at IS NULL"
        + (" FOR UPDATE" if lock else ""), (student_id,),
    ).fetchone()
    session = connection.execute(
        """SELECT student_sessions.token_hash FROM student_sessions JOIN students ON students.id=student_sessions.student_id
        WHERE student_sessions.student_id=%s AND token_hash=%s AND expires_at > clock_timestamp()
        AND student_updated_at=students.updated_at""" + (" FOR SHARE OF student_sessions" if lock else ""),
        (student_id, token_digest(credentials.credentials)),
    ).fetchone()
    if not student or not session:
        raise failure(401, "Please sign in again.")
    opened = connection.execute(
        "SELECT is_open FROM programme_weeks WHERE admin_id=%s AND week=%s"
        + (" FOR SHARE" if lock else ""), (student["admin_id"], week),
    ).fetchone()
    if not opened or not opened["is_open"]:
        raise failure(403, "This week is locked.")


def prior_attempt(connection, student_id, week, payload):
    saved = connection.execute(
        f"SELECT {RECEIPT_FIELDS}, drive_file_id FROM student_submissions WHERE student_id=%s AND week=%s AND request_id=%s",
        (student_id, week, payload.request_id),
    ).fetchone()
    if saved:
        if saved.pop("drive_file_id") != payload.file_id or saved["kind"] != payload.kind:
            raise failure(409, "This submission request was already used for another notebook.")
        return saved
    count = connection.execute(
        "SELECT count(*) AS total FROM student_submissions WHERE student_id=%s AND week=%s AND kind=%s", (student_id, week, payload.kind),
    ).fetchone()["total"]
    if count >= MAX_ATTEMPTS:
        raise failure(409, "The limit of 20 submissions for this week has been reached.")
    return None


def drive_get(file_id, access_token, query, limit):
    request = URLRequest(f"https://www.googleapis.com/drive/v3/files/{file_id}?{urlencode(query)}",
                         headers={"Authorization": f"Bearer {access_token}"}, method="GET")
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            content = response.read(limit + 1)
        if len(content) > limit:
            raise failure(413, "Notebook exceeds the 2 MiB limit.")
        return content
    except HTTPError as error:
        status = error.code
        error.close()
        if status == 401:
            raise failure(409, "Reconnect Google Drive and select the notebook again.") from None
        if status in (403, 404):
            raise failure(422, "Notebook is unavailable. Select an accessible file from Google Drive.") from None
        raise failure(503, "Google Drive download is temporarily unavailable.") from None
    except (OSError, URLError, HTTPClientError):
        raise failure(503, "Google Drive download is temporarily unavailable.") from None


def invalid_constant(value):
    raise ValueError("Non-finite JSON number")


def download_notebook(file_id, access_token):
    query = {"fields": "id,name,mimeType,size,version,trashed,md5Checksum", "supportsAllDrives": "true"}
    try:
        before = json.loads(drive_get(file_id, access_token, query, 65_536))
        if not isinstance(before, dict):
            raise ValueError()
        name, mime = before.get("name"), before.get("mimeType")
        if (before.get("id") != file_id or before.get("trashed") is not False
                or not isinstance(name, str) or not 1 <= len(name) <= 1024 or not name.lower().endswith(".ipynb")
                or any(ord(character) < 32 for character in name)
                or not isinstance(mime, str) or mime.startswith("application/vnd.google-apps.")
                or not isinstance(before.get("version"), str) or not before["version"].isdigit()
                or not isinstance(before.get("size"), str) or not before["size"].isdigit()):
            raise ValueError()
        if int(before["size"]) > MAX_BYTES:
            raise failure(413, "Notebook exceeds the 2 MiB limit.")
        content = drive_get(file_id, access_token, {"alt": "media", "supportsAllDrives": "true"}, MAX_BYTES)
        after = json.loads(drive_get(file_id, access_token, query, 65_536))
        if before != after or len(content) != int(before["size"]):
            raise failure(409, "Notebook changed during download. Save it in Colab and submit again.")
        checksum = before.get("md5Checksum")
        if checksum is not None and checksum != hashlib.md5(content, usedforsecurity=False).hexdigest():
            raise failure(409, "Notebook changed during download. Save it in Colab and submit again.")
        notebook = json.loads(content.decode("utf-8"), parse_constant=invalid_constant)
        if (not isinstance(notebook, dict) or type(notebook.get("nbformat")) is not int or notebook["nbformat"] != 4
                or type(notebook.get("nbformat_minor")) is not int or not 0 <= notebook["nbformat_minor"] <= 5):
            raise ValueError()
        nbformat.validate(notebook, version=4, version_minor=notebook["nbformat_minor"])
        return name, content
    except (ValueError, TypeError, UnicodeError, RecursionError, nbformat.ValidationError):
        raise failure(422, "Select a valid Jupyter notebook (.ipynb, format 4).") from None


@router.post("/{week}", status_code=201)
def submit(week: WeekNumber, payload: SubmissionInput, student: Student, credentials: Credentials, response: Response):
    response.headers.update(PRIVATE_HEADERS)
    with connect_database() as connection:
        access(connection, student.id, credentials, week)
        saved = prior_attempt(connection, student.id, week, payload)
        if saved:
            response.status_code = 200
            return saved
    access_token, _, encrypted = refresh_access(student.id)
    filename, content = download_notebook(payload.file_id, access_token)
    with connect_database() as connection:
        access(connection, student.id, credentials, week, lock=True)
        saved = prior_attempt(connection, student.id, week, payload)
        if saved:
            response.status_code = 200
            return saved
        current = connection.execute(
            "SELECT refresh_token_encrypted FROM student_google_drive WHERE student_id=%s FOR SHARE", (student.id,),
        ).fetchone()
        if not current or current["refresh_token_encrypted"] != encrypted:
            raise failure(409, "Google Drive connection changed. Select your notebook again.")
        return connection.execute(
            f"""INSERT INTO student_submissions (id, student_id, week, request_id, drive_file_id, filename, notebook, sha256, kind)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {RECEIPT_FIELDS}""",
            (uuid4(), student.id, week, payload.request_id, payload.file_id, filename, content, hashlib.sha256(content).hexdigest(), payload.kind),
        ).fetchone()


@router.get("/{week}")
def history(week: WeekNumber, student: Student, credentials: Credentials, response: Response,
            page: Annotated[int, Query(ge=1, le=1000)] = 1, start: date | None = None, end: date | None = None,
            kind: SubmissionKind = "homework"):
    if start and end and start > end:
        raise failure(422, "Start date must not be after end date.")
    if end and end == date.max:
        raise failure(422, "End date is out of range.")
    filters, values = "student_id=%s AND week=%s AND kind=%s", [student.id, week, kind]
    for boundary, operator in [(start, ">="), (end, "<")]:
        if boundary:
            filters += f" AND submitted_at {operator} %s"
            values.append(datetime.combine(boundary if operator == ">=" else boundary + timedelta(days=1), time(), ZoneInfo("Asia/Kolkata")))
    with connect_database() as connection:
        access(connection, student.id, credentials, week)
        total = connection.execute(f"SELECT count(*) AS total FROM student_submissions WHERE {filters}", values).fetchone()["total"]
        items = connection.execute(
            f"SELECT {RECEIPT_FIELDS}, {REVIEW_SELECT} FROM student_submissions WHERE {filters} ORDER BY submitted_at DESC, id DESC LIMIT 10 OFFSET %s",
            [*values, (page - 1) * 10],
        ).fetchall()
    response.headers.update(PRIVATE_HEADERS)
    return {"items": items, "total": total, "page": page, "page_size": 10}


@router.get("/{week}/{submission_id}/download")
def download(week: WeekNumber, submission_id: UUID, student: Student, credentials: Credentials):
    with connect_database() as connection:
        access(connection, student.id, credentials, week)
        saved = connection.execute(
            "SELECT notebook FROM student_submissions WHERE id=%s AND student_id=%s AND week=%s",
            (submission_id, student.id, week),
        ).fetchone()
    if not saved:
        raise failure(404, "Submission not found.")
    return Response(bytes(saved["notebook"]), media_type="application/octet-stream", headers={
        **PRIVATE_HEADERS, "Content-Disposition": f'attachment; filename="submission-{submission_id}.ipynb"',
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Referrer-Policy": "no-referrer",
    })