from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from pydantic import BaseModel, ConfigDict, Field

from admin_auth import PRIVATE_HEADERS, require_admin
from database import connect_database
from student_auth import StudentAccount, require_student


router = APIRouter(tags=["Programme access"])
WeekNumber = Annotated[int, Path(ge=1, le=4)]


class WeekAccess(BaseModel):
    week: int
    is_open: bool


class WeekUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_open: bool = Field(strict=True)


def read_weeks(connection, admin_id):
    records = connection.execute(
        "SELECT week, is_open FROM programme_weeks WHERE admin_id=%s", (admin_id,),
    ).fetchall()
    states = {record["week"]: record["is_open"] for record in records}
    return [WeekAccess(week=week, is_open=states.get(week, False)) for week in range(1, 5)]


@router.get("/admin/programme", response_model=list[WeekAccess])
def admin_weeks(admin: Annotated[dict, Depends(require_admin)], response: Response):
    with connect_database() as connection:
        weeks = read_weeks(connection, admin["id"])
    response.headers.update(PRIVATE_HEADERS)
    return weeks


@router.put("/admin/programme/{week}", response_model=WeekAccess)
def update_week(week: WeekNumber, payload: WeekUpdate,
                admin: Annotated[dict, Depends(require_admin)], response: Response):
    with connect_database() as connection:
        record = connection.execute(
            """INSERT INTO programme_weeks (admin_id, week, is_open) VALUES (%s, %s, %s)
            ON CONFLICT (admin_id, week) DO UPDATE SET is_open=EXCLUDED.is_open
            RETURNING week, is_open""", (admin["id"], week, payload.is_open),
        ).fetchone()
    response.headers.update(PRIVATE_HEADERS)
    return record


def student_weeks(student):
    with connect_database() as connection:
        owner = connection.execute(
            "SELECT admin_id FROM students WHERE id=%s AND is_active=TRUE AND deleted_at IS NULL",
            (student.id,),
        ).fetchone()
        return read_weeks(connection, owner["admin_id"] if owner else None)


@router.get("/student/programme", response_model=list[WeekAccess])
def list_student_weeks(student: Annotated[StudentAccount, Depends(require_student)], response: Response):
    response.headers.update(PRIVATE_HEADERS)
    return student_weeks(student)


@router.get("/student/programme/{week}", response_model=WeekAccess)
def visit_week(week: WeekNumber, student: Annotated[StudentAccount, Depends(require_student)], response: Response):
    access = student_weeks(student)[week - 1]
    if not access.is_open:
        raise HTTPException(403, "This week is locked.", headers=PRIVATE_HEADERS)
    response.headers.update(PRIVATE_HEADERS)
    return access