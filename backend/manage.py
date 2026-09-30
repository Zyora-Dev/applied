import argparse
import getpass
import hashlib
from pathlib import Path
import secrets

from email_validator import validate_email
from psycopg import Error as DatabaseError, sql

from admin_auth import password_hasher
from database import connect_database
from runtime_config import validate_runtime_config


MIGRATIONS = (
    "schema.sql", "admin_auth.sql", "student_management.sql",
    "faculty_management.sql", "email_settings.sql", "student_auth.sql",
    "programme.sql", "google_drive.sql", "submissions.sql",
    "faculty_auth.sql", "faculty_portal.sql",
)
DIRECTORY = Path(__file__).parent


def migration_files():
    return [(name, (DIRECTORY / name).read_text(encoding="utf-8")) for name in MIGRATIONS]


def schema_signature(connection, schema):
    connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema)))
    rows = connection.execute(
        """
        SELECT 'column' AS kind, table_name AS owner, column_name AS name,
               concat_ws('|', data_type, udt_name, is_nullable, column_default,
                         is_identity, identity_generation, ordinal_position::text) AS definition
        FROM information_schema.columns WHERE table_schema = %s
        UNION ALL
        SELECT 'constraint', relation.relname, constraint_record.conname,
               pg_get_constraintdef(constraint_record.oid)
        FROM pg_constraint constraint_record
        JOIN pg_class relation ON relation.oid = constraint_record.conrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = %s
        UNION ALL
        SELECT 'index', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = %s
        UNION ALL
        SELECT 'trigger', relation.relname, trigger_record.tgname, pg_get_triggerdef(trigger_record.oid)
        FROM pg_trigger trigger_record
        JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = %s AND NOT trigger_record.tgisinternal
        UNION ALL
        SELECT 'function', '', procedure.proname, pg_get_functiondef(procedure.oid)
        FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = %s AND procedure.prokind = 'f'
        """,
        (schema,) * 5,
    ).fetchall()
    prefixes = (sql.Identifier(schema).as_string(connection) + ".", schema + ".")
    signature = set()
    for row in rows:
        if row["owner"] == "schema_migrations":
            continue
        definition = row["definition"]
        for prefix in prefixes:
            definition = definition.replace(prefix, "")
        signature.add((row["kind"], row["owner"], row["name"], definition))
    return signature


def migrate(connection, *, baseline=False):
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(739214650)")
        schema = connection.execute("SELECT current_schema() AS name").fetchone()["name"]
        if not schema:
            raise ValueError("Select an existing application schema in search_path.")
        files = migration_files()
        tracked = connection.execute("SELECT to_regclass('schema_migrations') AS name").fetchone()["name"]
        existing = connection.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname=%s AND tablename <> 'schema_migrations'", (schema,)
        ).fetchall()
        if existing and not tracked:
            if not baseline:
                raise ValueError("Existing untracked database: back it up, then run baseline-schema to verify it before adoption.")
            actual = schema_signature(connection, schema)
            reference = "migration_reference_" + secrets.token_hex(8)
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(reference)))
            connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(reference)))
            for name, source in files:
                connection.execute(source)
            expected = schema_signature(connection, reference)
            connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema)))
            if actual != expected:
                raise ValueError("Existing schema differs from the current migrations; no baseline recorded. Review schema differences manually.")
            connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(reference)))
        elif baseline and not tracked:
            raise ValueError("No existing application tables to baseline; use init-schema.")
        connection.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY, sha256 TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
            )"""
        )
        applied = {row["name"]: row["sha256"] for row in connection.execute("SELECT name, sha256 FROM schema_migrations")}
        if set(applied) - set(MIGRATIONS):
            raise ValueError("Database contains unknown migrations; refusing to run older code.")
        seen_pending = False
        for name, source in files:
            checksum = hashlib.sha256(source.encode("utf-8")).hexdigest()
            if name in applied:
                if seen_pending or applied[name] != checksum:
                    raise ValueError("Migration order or checksum differs: " + name)
                continue
            seen_pending = True
            if not (baseline and existing and not tracked):
                connection.execute(source)
            connection.execute("INSERT INTO schema_migrations (name, sha256) VALUES (%s, %s)", (name, checksum))


def create_admin(connection, email, password):
    email = validate_email(email, check_deliverability=False).normalized.lower()
    if not 8 <= len(password) <= 128:
        raise ValueError("Password must contain 8-128 characters.")
    with connection.transaction():
        result = connection.execute(
            """INSERT INTO admins (email, password_hash) VALUES (%s, %s)
            ON CONFLICT DO NOTHING RETURNING id""",
            (email, password_hasher.hash(password)),
        ).fetchone()
        if result is None:
            raise ValueError("Administrator already exists; no password or account was changed.")


def main():
    parser = argparse.ArgumentParser(description="Transactional Applied AI database management")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-schema", help="Apply unapplied migrations; refuse untracked existing tables")
    commands.add_parser("baseline-schema", help="Verify an existing schema and record checksums without changing application data")
    admin = commands.add_parser("create-admin", help="Create one admin; prompts privately for password")
    admin.add_argument("--email", required=True)
    args = parser.parse_args()
    try:
        validate_runtime_config()
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    password = None
    if args.command == "create-admin":
        password = getpass.getpass("New administrator password: ")
        if password != getpass.getpass("Confirm password: "):
            parser.exit(1, "Passwords do not match.\n")
    try:
        with connect_database() as connection:
            if args.command == "create-admin":
                create_admin(connection, args.email, password)
            else:
                migrate(connection, baseline=args.command == "baseline-schema")
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    except DatabaseError:
        parser.exit(1, "Database operation failed; check connectivity, permissions and schema. No partial migration was committed.\n")
    print("Completed " + args.command + ".")


if __name__ == "__main__":
    main()