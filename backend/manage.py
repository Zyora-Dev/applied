import argparse
import getpass
import os
import sys

import psycopg
from argon2 import PasswordHasher
from email_validator import EmailNotValidError, validate_email
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from auth import initialize_auth_tables
from database import connect_database, database_url
from students import initialize_student_tables
from faculty import initialize_faculty_tables
from student_auth import initialize_student_auth_tables


def initialize_database() -> None:
    connection_string = database_url()
    name = conninfo_to_dict(connection_string).get("dbname")
    if name != "applied-ai":
        raise ValueError("Database initialization requires DATABASE_URL to target applied-ai.")
    with psycopg.connect(
        connection_string, dbname="postgres", autocommit=True, connect_timeout=5
    ) as connection:
        existing = connection.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (name,)
        ).fetchone()
        if existing is None:
            try:
                connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
            except psycopg.errors.DuplicateDatabase:
                pass
    initialize_schema()
    print("Database applied-ai is ready. Existing data was preserved.")


def initialize_schema() -> None:
    with connect_database() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        initialize_auth_tables(connection)
        initialize_student_tables(connection)
        initialize_faculty_tables(connection)
        initialize_student_auth_tables(connection)
    print("Database tables are ready. Existing data was preserved.")


def normalize_email(value: str) -> str:
    return validate_email(value.strip(), check_deliverability=False).normalized.lower()


def create_admin() -> None:
    configured_email = os.environ.get("ADMIN_EMAIL", "").strip()
    configured_password = os.environ.get("ADMIN_PASSWORD", "")
    if configured_email or configured_password:
        if not configured_email or not configured_password:
            raise ValueError("Set both ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env.")
        email = normalize_email(configured_email)
        password = configured_password
    else:
        if not sys.stdin.isatty():
            raise ValueError("Set ADMIN_EMAIL and ADMIN_PASSWORD or use an interactive terminal.")
        email = normalize_email(input("Admin email: "))
        password = getpass.getpass("Admin password (minimum 12 characters): ")
        if password != getpass.getpass("Confirm admin password: "):
            raise ValueError("Passwords do not match.")
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters.")
    password_hash = PasswordHasher().hash(password)
    del password
    with connect_database() as connection:
        connection.execute(
            "INSERT INTO admins (email, password_hash) VALUES (%s, %s)",
            (email, password_hash),
        )
    print("Admin created. Only the password hash was stored.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Applied AI database and admin setup")
    parser.add_argument("command", choices=("init", "init-schema", "create-admin"))
    arguments = parser.parse_args()
    try:
        if arguments.command == "init":
            initialize_database()
        elif arguments.command == "init-schema":
            initialize_schema()
        else:
            create_admin()
    except psycopg.errors.UniqueViolation:
        print("Admin already exists; no credentials were changed.", file=sys.stderr)
        return 1
    except (EmailNotValidError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    except psycopg.Error as error:
        print(
            f"Database setup failed ({type(error).__name__}, SQLSTATE {error.sqlstate or 'unavailable'}). "
            "Check PostgreSQL availability, DATABASE_URL and database permissions.",
            file=sys.stderr,
        )
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\nSetup cancelled.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())