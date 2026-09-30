from pathlib import Path
import asyncio
import os
import secrets
import unittest
from unittest.mock import patch

import psycopg
from cryptography.fernet import Fernet
from psycopg import sql
from psycopg.rows import dict_row

import manage
from runtime_config import validate_runtime_config


class RuntimeConfigTests(unittest.TestCase):
    def configuration(self):
        return {
            "APP_ENV": "production", "DATABASE_URL": "postgresql://user:secret@database/app",
            "STUDENT_APP_ORIGIN": "https://portal.example.com",
            "EMAIL_SETTINGS_KEY": Fernet.generate_key().decode(),
            "GOOGLE_DRIVE_ENCRYPTION_KEY": Fernet.generate_key().decode(),
            "GOOGLE_CLIENT_ID": "client", "GOOGLE_CLIENT_SECRET": "private",
            "GOOGLE_REDIRECT_URI": "https://portal.example.com/api/student/google-drive/callback",
            "GOOGLE_PICKER_API_KEY": "picker", "GOOGLE_PROJECT_NUMBER": "123456",
        }

    def test_local_defaults_and_complete_production(self):
        for environment in ({}, self.configuration()):
            with self.subTest(environment=environment.get("APP_ENV", "local")), patch.dict(os.environ, environment, clear=True):
                validate_runtime_config()

    def test_render_rejects_local_fallback_and_production_requires_all_fields(self):
        with patch.dict(os.environ, {"RENDER": "true"}, clear=True):
            with self.assertRaisesRegex(ValueError, "APP_ENV"):
                validate_runtime_config()
        configuration = self.configuration()
        for name in configuration.keys() - {"APP_ENV"}:
            with self.subTest(name=name), patch.dict(os.environ, {**configuration, name: ""}, clear=True):
                with self.assertRaisesRegex(ValueError, name):
                    validate_runtime_config()

    def test_invalid_configuration_rejected_without_secret_values(self):
        cases = [
            ("STUDENT_APP_ORIGIN", origin) for origin in (
                "http://portal.example.com", "https://portal.example.com/", "https://user:secret@portal.example.com",
                "https://portal.example.com?query", "https://portal.example.com#fragment", "https://portal.example.com:bad",
            )
        ] + [
            ("GOOGLE_REDIRECT_URI", "https://other.example.com/api/student/google-drive/callback"),
            ("EMAIL_SETTINGS_KEY", "private-invalid-key"), ("GOOGLE_DRIVE_ENCRYPTION_KEY", "private-invalid-key"),
            ("GOOGLE_PROJECT_NUMBER", "project-name"), ("DATABASE_URL", "private-invalid-connection"),
        ]
        for name, value in cases:
            with self.subTest(name=name, value=value), patch.dict(os.environ, {**self.configuration(), name: value}, clear=True):
                with self.assertRaisesRegex(ValueError, name) as failure:
                    validate_runtime_config()
                self.assertNotIn(value, str(failure.exception))

    def test_application_startup_checks_configuration(self):
        from main import app

        async def startup():
            async with app.router.lifespan_context(app):
                pass

        with patch.dict(os.environ, {"APP_ENV": "production"}, clear=True):
            with self.assertRaisesRegex(ValueError, "Missing production configuration"):
                asyncio.run(startup())


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.connection = psycopg.connect("host=localhost dbname=applied-ai connect_timeout=5", row_factory=dict_row)
        self.addCleanup(self.connection.close)
        self.addCleanup(self.connection.rollback)
        schema = "test_manage_" + secrets.token_hex(8)
        self.connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        self.connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema)))

    def test_fresh_repeat_and_checksum_protection(self):
        manage.migrate(self.connection)
        self.assertEqual(self.connection.execute("SELECT count(*) AS total FROM schema_migrations").fetchone()["total"], len(manage.MIGRATIONS))
        manage.create_admin(self.connection, "ADMIN@example.com", "a-long-test-password")
        before = self.connection.execute("SELECT * FROM admins").fetchall()
        manage.migrate(self.connection)
        self.assertEqual(before, self.connection.execute("SELECT * FROM admins").fetchall())
        with self.assertRaises(ValueError):
            manage.create_admin(self.connection, "admin@example.com", "another-password")
        self.assertEqual(before, self.connection.execute("SELECT * FROM admins").fetchall())
        self.connection.execute("UPDATE schema_migrations SET sha256='changed' WHERE name='schema.sql'")
        with self.assertRaisesRegex(ValueError, "checksum"):
            manage.migrate(self.connection)

    def test_existing_schema_baseline_preserves_records(self):
        for name, source in manage.migration_files():
            self.connection.execute(source)
        manage.create_admin(self.connection, "admin@example.com", "a-long-test-password")
        before = self.connection.execute("SELECT * FROM admins").fetchall()
        with self.assertRaisesRegex(ValueError, "untracked"):
            manage.migrate(self.connection)
        manage.migrate(self.connection, baseline=True)
        manage.migrate(self.connection)
        self.assertEqual(before, self.connection.execute("SELECT * FROM admins").fetchall())

    def test_partial_schema_refused_without_ledger(self):
        self.connection.execute((Path(__file__).parent / "schema.sql").read_text())
        with self.assertRaisesRegex(ValueError, "differs"):
            manage.migrate(self.connection, baseline=True)
        self.assertIsNone(self.connection.execute("SELECT to_regclass('schema_migrations') AS name").fetchone()["name"])
        self.assertEqual(self.connection.execute("SELECT current_schema() AS name").fetchone()["name"][:12], "test_manage_")