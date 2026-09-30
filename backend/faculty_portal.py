from datetime import date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field

from admin_auth import PRIVATE_HEADERS, bearer, token_digest, unauthorized
from database import connect_database
from faculty_auth import Faculty
from programme import WeekNumber
from students import FIELDS
from submissions import RECEIPT_FIELDS, REVIEW_SELECT, SubmissionKind, failure


router = APIRouter(prefix="/faculty/students", tags=["Faculty monitoring"])
Credentials = Annotated[HTTPAuthorizationCredentials, Depends(bearer)]


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score: int = Field(ge=0, le=100, strict=True)
    feedback: str = Field(min_length=1, max_length=10000)
    expected_review_id: UUID | None = None


def verify_access(connection, faculty, credentials):
    current = connection.execute(
        """SELECT faculty.id FROM faculty JOIN faculty_sessions ON faculty_sessions.faculty_id=faculty.id
        WHERE faculty.id=%s AND faculty.admin_id=%s AND faculty.is_active=TRUE AND faculty.deleted_at IS NULL
        AND token_hash=%s AND expires_at > clock_timestamp() AND faculty_updated_at=faculty.updated_at
        FOR SHARE OF faculty, faculty_sessions""", (faculty.id, faculty.admin_id, token_digest(credentials.credentials)),
    ).fetchone()
    if not current:
        raise unauthorized()


def owned_student(connection, faculty, record_id):
    record = connection.execute(
        f"SELECT {FIELDS} FROM students WHERE id=%s AND admin_id=%s AND deleted_at IS NULL FOR SHARE",
        (record_id, faculty.admin_id),
    ).fetchone()
    if not record:
        raise failure(404, "Student not found.")
    return record


def date_filters(start, end, column):
    if start and end and start > end or end == date.max:
        raise failure(422, "Invalid date range.")
    conditions, values = [], []
    for boundary, operator in ((start, ">="), (end, "<")):
        if boundary:
            conditions.append(f"{column} {operator} %s")
            values.append(datetime.combine(boundary if operator == ">=" else boundary + timedelta(days=1), time(), ZoneInfo("Asia/Kolkata")))
    return conditions, values


def progress(connection, student_id):
    return connection.execute(
        f"""SELECT DISTINCT ON (week, kind) {RECEIPT_FIELDS}, {REVIEW_SELECT}
        FROM student_submissions WHERE student_id=%s ORDER BY week, kind, submitted_at DESC, id DESC""",
        (student_id,),
    ).fetchall()


@router.get("/")
def students(faculty: Faculty, credentials: Credentials, response: Response,
             page: int = Query(1, ge=1, le=1000000), search: str = Query("", max_length=100),
             start: date | None = None, end: date | None = None):
    conditions, values = date_filters(start, end, "created_at")
    conditions.extend(["admin_id=%s", "deleted_at IS NULL"])
    values.append(faculty.admin_id)
    if search.strip():
        conditions.append("concat_ws(' ',name,student_id,email,college,degree) ILIKE %s")
        term = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        values.append(f"%{term}%")
    where = " AND ".join(conditions)
    with connect_database() as connection:
        verify_access(connection, faculty, credentials)
        summary = connection.execute(
            f"SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active FROM students WHERE {where}", values,
        ).fetchone()
        records = connection.execute(
            f"SELECT {FIELDS} FROM students WHERE {where} ORDER BY name,id LIMIT 20 OFFSET %s", [*values, (page - 1) * 20],
        ).fetchall()
        for record in records:
            record["submissions"] = progress(connection, record["id"])
    response.headers.update(PRIVATE_HEADERS)
    return {"items": records, "total": summary["total"], "active": summary["active"], "page": page, "page_size": 20}


@router.get("/{record_id}")
def student(record_id: int, faculty: Faculty, credentials: Credentials, response: Response):
    with connect_database() as connection:
        verify_access(connection, faculty, credentials)
        record = owned_student(connection, faculty, record_id)
        record["submissions"] = progress(connection, record_id)
    response.headers.update(PRIVATE_HEADERS)
    return record


@router.get("/{record_id}/submissions")
def submissions(record_id: int, faculty: Faculty, credentials: Credentials, response: Response,
                week: WeekNumber = 1, kind: SubmissionKind = "homework", page: int = Query(1, ge=1, le=1000),
                start: date | None = None, end: date | None = None):
    conditions, values = date_filters(start, end, "submitted_at")
    conditions.extend(["student_id=%s", "week=%s", "kind=%s"])
    values.extend([record_id, week, kind])
    where = " AND ".join(conditions)
    with connect_database() as connection:
        verify_access(connection, faculty, credentials)
        owned_student(connection, faculty, record_id)
        total = connection.execute(f"SELECT count(*) AS total FROM student_submissions WHERE {where}", values).fetchone()["total"]
        items = connection.execute(
            f"SELECT {RECEIPT_FIELDS}, {REVIEW_SELECT} FROM student_submissions WHERE {where} ORDER BY submitted_at DESC,id DESC LIMIT 10 OFFSET %s",
            [*values, (page - 1) * 10],
        ).fetchall()
    response.headers.update(PRIVATE_HEADERS)
    return {"items": items, "total": total, "page": page, "page_size": 10}


@router.get("/{record_id}/submissions/{submission_id}/download")
def download(record_id: int, submission_id: UUID, faculty: Faculty, credentials: Credentials):
    with connect_database() as connection:
        verify_access(connection, faculty, credentials)
        owned_student(connection, faculty, record_id)
        saved = connection.execute("SELECT notebook FROM student_submissions WHERE id=%s AND student_id=%s", (submission_id, record_id)).fetchone()
    if not saved:
        raise failure(404, "Submission not found.")
    return Response(bytes(saved["notebook"]), media_type="application/octet-stream", headers={
        **PRIVATE_HEADERS, "Content-Disposition": f'attachment; filename="submission-{submission_id}.ipynb"',
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Referrer-Policy": "no-referrer",
    })


@router.get("/{record_id}/submissions/{submission_id}/reviews")
def reviews(record_id: int, submission_id: UUID, faculty: Faculty, credentials: Credentials, response: Response,
            page: int = Query(1, ge=1, le=1000)):
    with connect_database() as connection:
        verify_access(connection, faculty, credentials)
        owned_student(connection, faculty, record_id)
        if not connection.execute("SELECT id FROM student_submissions WHERE id=%s AND student_id=%s", (submission_id, record_id)).fetchone():
            raise failure(404, "Submission not found.")
        total = connection.execute("SELECT count(*) AS total FROM submission_reviews WHERE submission_id=%s", (submission_id,)).fetchone()["total"]
        items = connection.execute(
            """SELECT submission_reviews.id,score,feedback,reviewed_at,faculty.name AS faculty_name
            FROM submission_reviews JOIN faculty ON faculty.id=faculty_id WHERE submission_id=%s
            ORDER BY reviewed_at DESC,submission_reviews.id DESC LIMIT 10 OFFSET %s""", (submission_id, (page - 1) * 10),
        ).fetchall()
    response.headers.update(PRIVATE_HEADERS)
    return {"items": items, "total": total, "page": page, "page_size": 10}


@router.post("/{record_id}/submissions/{submission_id}/reviews", status_code=201)
def review(record_id: int, submission_id: UUID, payload: ReviewInput, faculty: Faculty, credentials: Credentials, response: Response):
    if not payload.feedback.strip():
        raise failure(422, "Enter feedback for the student.")
    with connect_database() as connection:
        verify_access(connection, faculty, credentials)
        owned_student(connection, faculty, record_id)
        if not connection.execute("SELECT id FROM student_submissions WHERE id=%s AND student_id=%s FOR UPDATE", (submission_id, record_id)).fetchone():
            raise failure(404, "Submission not found.")
        latest = connection.execute(
            "SELECT id FROM submission_reviews WHERE submission_id=%s ORDER BY reviewed_at DESC,id DESC LIMIT 1", (submission_id,),
        ).fetchone()
        if (latest["id"] if latest else None) != payload.expected_review_id:
            raise failure(409, "This submission has a newer review. Refresh before grading again.")
        saved = connection.execute(
            """INSERT INTO submission_reviews (id,submission_id,faculty_id,score,feedback) VALUES (%s,%s,%s,%s,%s)
            RETURNING id,score,feedback,reviewed_at""", (uuid4(), submission_id, faculty.id, payload.score, payload.feedback.strip()),
        ).fetchone()
    response.headers.update(PRIVATE_HEADERS)
    return {**saved, "faculty_name": faculty.name}