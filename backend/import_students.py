import argparse
import csv
import json
from pathlib import Path
import secrets

from psycopg import Error as DatabaseError
from pydantic import ValidationError

from admin_auth import password_hasher
from database import connect_database
from students import StudentInput, student_values


CSV_COLUMNS = {"SI.NO", "REGISTER NUMBER", "Student Name", "GENDER", "MOBILE", "Email ID"}
GENDERS = {"MALE": "Male", "FEMALE": "Female", "OTHER": "Other", "PREFER NOT TO SAY": "Prefer not to say"}


def read_students(stream, *, college, degree, year):
    reader = csv.DictReader(stream, strict=True)
    if reader.fieldnames is None or set(reader.fieldnames) != CSV_COLUMNS or len(reader.fieldnames) != len(CSV_COLUMNS):
        raise ValueError("CSV columns do not match the student import format.")
    records = []
    student_ids = set()
    emails = set()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"CSV line {reader.line_num}: incorrect column count.")
        gender = row["GENDER"].strip().upper()
        if gender not in GENDERS:
            raise ValueError(f"CSV line {reader.line_num}: unsupported gender.")
        try:
            record = StudentInput(
                name=row["Student Name"], student_id=row["REGISTER NUMBER"],
                email=row["Email ID"], mobile=row["MOBILE"], gender=GENDERS[gender],
                college=college, degree=degree, year=year, is_active=False,
            )
        except ValidationError as error:
            fields = ", ".join(str(item["loc"][0]) for item in error.errors())
            raise ValueError(f"CSV line {reader.line_num}: invalid {fields}.") from None
        if record.student_id in student_ids or record.email in emails:
            raise ValueError(f"CSV line {reader.line_num}: duplicate register number or email.")
        student_ids.add(record.student_id)
        emails.add(record.email)
        records.append(record)
    if not records:
        raise ValueError("CSV contains no students.")
    return records


def validate_import(connection, records, admin_id):
    admin = connection.execute(
        "SELECT id FROM admins WHERE id=%s AND is_active=TRUE AND deleted_at IS NULL",
        (admin_id,),
    ).fetchone()
    if admin is None:
        raise ValueError("Import owner must be an active admin.")
    conflicts = connection.execute(
        "SELECT count(*) AS total FROM students WHERE student_id = ANY(%s) OR lower(email) = ANY(%s)",
        ([record.student_id for record in records], [str(record.email) for record in records]),
    ).fetchone()["total"]
    if conflicts:
        raise ValueError(f"Import stopped: {conflicts} existing records conflict, including archived or other-owner records. Nothing overwritten.")


def import_students(connection, records, admin_id):
    with connection.transaction():
        validate_import(connection, records, admin_id)
        inserted = []
        for record in records:
            if record.is_active:
                raise ValueError("Imported accounts must remain inactive.")
            saved = connection.execute(
                """INSERT INTO students
                (name, student_id, email, mobile, college, degree, year, github, linkedin, is_active, gender, password_hash, admin_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (*student_values(record), password_hasher.hash(secrets.token_urlsafe(48)), admin_id),
            ).fetchone()
            inserted.append(saved["id"])
        return inserted


def main():
    parser = argparse.ArgumentParser(description="Import inactive students without sending email. Default is a read-only dry run.")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--admin-id", type=int, required=True)
    parser.add_argument("--college", required=True)
    parser.add_argument("--degree", required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()
    try:
        with args.csv_path.open(encoding="utf-8-sig", newline="") as stream:
            records = read_students(stream, college=args.college, degree=args.degree, year=args.year)
        with connect_database() as connection:
            if not args.commit:
                connection.execute("SET TRANSACTION READ ONLY")
            validate_import(connection, records, args.admin_id)
            if args.commit:
                connection.execute((Path(__file__).parent / "student_management.sql").read_text())
                inserted = import_students(connection, records, args.admin_id)
            else:
                inserted = []
        print(json.dumps({
            "mode": "committed" if args.commit else "dry_run", "validated": len(records),
            "inserted": len(inserted), "active": 0, "emails_sent": 0,
            "genders": {gender: sum(record.gender == gender for record in records) for gender in sorted({record.gender for record in records})},
        }))
    except (ValueError, csv.Error) as error:
        parser.exit(1, f"{error}\n")
    except (OSError, DatabaseError):
        parser.exit(1, "Import failed; no changes committed. Check the file, database connection and constraints.\n")


if __name__ == "__main__":
    main()