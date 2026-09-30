import asyncio
from contextlib import contextmanager
import json
from pathlib import Path
import secrets
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from starlette.requests import Request

import admin_auth
import student_auth
from main import app


async def call_api(method, path, payload=None, token=None):
    messages = []
    url = urlsplit(path)
    body = json.dumps(payload).encode() if payload is not None else b""
    headers = [(b"content-type", b"application/json")]
    if token is not None:
        headers.append((b"authorization", f"Bearer {token}".encode()))
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": url.path,
        "raw_path": url.path.encode(), "query_string": url.query.encode(), "root_path": "",
        "headers": headers, "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    start = next(message for message in messages if message["type"] == "http.response.start")
    result = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], dict(start["headers"]), json.loads(result) if result else None


class AdminAuthTests(unittest.TestCase):
    def setUp(self):
        self.connection = psycopg.connect(
            "host=localhost dbname=applied-ai connect_timeout=5", row_factory=dict_row
        )
        self.addCleanup(self.connection.close)
        self.addCleanup(self.connection.rollback)
        schema = "test_admin_auth_" + secrets.token_hex(8)
        self.connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        self.connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema)))
        directory = Path(__file__).parent
        self.connection.execute((directory / "schema.sql").read_text())
        self.connection.execute((directory / "admin_auth.sql").read_text())
        self.connection.execute((directory / "email_settings.sql").read_text())
        self.connection.execute((directory / "student_auth.sql").read_text())
        self.password = "  " + secrets.token_urlsafe(24) + "  "
        self.admin_id = self.connection.execute(
            "INSERT INTO admins (email, password_hash) VALUES (%s, %s) RETURNING id",
            ("admin@example.com", admin_auth.password_hasher.hash(self.password)),
        ).fetchone()["id"]

        @contextmanager
        def test_connection():
            with self.connection.transaction():
                yield self.connection

        connection_patch = patch.object(admin_auth, "connect_database", test_connection)
        connection_patch.start()
        self.addCleanup(connection_patch.stop)
        student_patch = patch.object(student_auth, "connect_database", test_connection)
        student_patch.start()
        self.addCleanup(student_patch.stop)

    def request(self, method, path, payload=None, token=None):
        return asyncio.run(call_api(method, path, payload, token))

    def login(self):
        return self.request("POST", "/admin/login", {"email": "ADMIN@example.com", "password": self.password})

    def test_login_identity_logout(self):
        self.assertEqual(self.request("GET", "/admin/me")[0], 401)
        status, headers, result = self.login()
        self.assertEqual(status, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertNotIn("password", json.dumps(result))
        self.assertEqual(result["admin"]["id"], self.admin_id)
        token = result["access_token"]
        stored = self.connection.execute("SELECT * FROM admin_sessions").fetchone()
        self.assertNotEqual(stored["token_hash"], token)
        self.assertEqual(stored["token_hash"], admin_auth.token_digest(token))
        self.assertAlmostEqual((stored["expires_at"] - stored["created_at"]).total_seconds(), 28800, delta=1)
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 200)
        self.assertEqual(self.request("POST", "/admin/logout", token=token)[0], 204)
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 401)
        self.assertEqual(self.request("POST", "/admin/logout", token=token)[0], 204)

    def test_bad_credentials_and_validation_do_not_leak_passwords(self):
        wrong = self.request("POST", "/admin/login", {"email": "admin@example.com", "password": self.password.strip()})
        missing = self.request("POST", "/admin/login", {"email": "missing@example.com", "password": self.password})
        self.assertEqual(wrong[0], 401)
        self.assertEqual(wrong[2], missing[2])
        invalid = self.request("POST", "/admin/login", {"email": "admin@example.com", "password": {"secret": self.password}})
        self.assertEqual(invalid[0], 422)
        self.assertNotIn(self.password, json.dumps(invalid[2]))
        self.assertEqual(self.request("GET", "/admin/me", token=secrets.token_urlsafe(32))[0], 401)

    def test_expired_changed_disabled_and_deleted_accounts(self):
        token = self.login()[2]["access_token"]
        self.connection.execute("UPDATE admin_sessions SET expires_at = now() - interval '1 second'")
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 401)
        token = self.login()[2]["access_token"]
        self.connection.execute("UPDATE admins SET password_hash = %s", (admin_auth.password_hasher.hash("changed-password"),))
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 401)
        self.connection.execute("UPDATE admins SET password_hash = %s", (admin_auth.password_hasher.hash(self.password),))
        token = self.login()[2]["access_token"]
        self.connection.execute("UPDATE admins SET is_active = FALSE")
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 401)
        self.assertEqual(self.login()[0], 401)
        self.connection.execute("UPDATE admins SET is_active = TRUE, deleted_at = now()")
        self.assertEqual(self.login()[0], 401)

    def test_student_login_isolation_logout_and_account_changes(self):
        self.connection.execute(
            """INSERT INTO students (name, student_id, email, mobile, password_hash, college, degree, year)
            VALUES ('Student', 'ST-1', 'student@example.com', '1234567890', %s, 'College', 'Civil', 2)""",
            (admin_auth.password_hasher.hash(self.password),),
        )
        payload = {"email": "STUDENT@example.com", "password": self.password}
        admin_token = self.login()[2]["access_token"]
        self.assertEqual(self.request("GET", "/student/me", token=admin_token)[0], 401)
        for changes in ({"password": "wrong"}, {"email": "missing@example.com"}):
            result = self.request("POST", "/student/login", {**payload, **changes})
            self.assertEqual(result[0], 401)
            self.assertEqual(result[2]["detail"], "Invalid email or password.")
        result = self.request("POST", "/student/login", payload)
        self.assertEqual(result[0], 200)
        token = result[2]["access_token"]
        self.assertNotIn("password", json.dumps(result[2]))
        stored = self.connection.execute("SELECT * FROM student_sessions").fetchone()
        self.assertEqual(stored["token_hash"], admin_auth.token_digest(token))
        self.assertNotEqual(stored["token_hash"], token)
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 401)
        self.assertEqual(self.request("GET", "/student/me", token=token)[0], 200)
        self.assertEqual(self.request("POST", "/student/logout", token=token)[0], 204)
        self.assertEqual(self.request("GET", "/student/me", token=token)[0], 401)
        token = self.request("POST", "/student/login", payload)[2]["access_token"]
        self.connection.execute("UPDATE students SET password_hash=%s", (admin_auth.password_hasher.hash(self.password),))
        self.assertEqual(self.request("GET", "/student/me", token=token)[0], 401)
        self.connection.execute("UPDATE students SET is_active=FALSE")
        self.assertEqual(self.request("POST", "/student/login", payload)[0], 401)
        self.connection.execute("UPDATE students SET is_active=TRUE, deleted_at=now()")
        self.assertEqual(self.request("POST", "/student/login", payload)[0], 401)

    def test_student_password_change_is_owned_and_revokes_sessions(self):
        for student_id, email in (("ST-1", "student@example.com"), ("ST-2", "other@example.com")):
            self.connection.execute(
                """INSERT INTO students (name, student_id, email, mobile, password_hash, college, degree, year)
                VALUES ('Student', %s, %s, '1234567890', %s, 'College', 'Civil', 2)""",
                (student_id, email, admin_auth.password_hasher.hash(self.password)),
            )
        login = {"email": "student@example.com", "password": self.password}
        token = self.request("POST", "/student/login", login)[2]["access_token"]
        second = self.request("POST", "/student/login", login)[2]["access_token"]
        other = self.request("POST", "/student/login", {**login, "email": "other@example.com"})[2]["access_token"]
        admin_token = self.login()[2]["access_token"]
        payload = {"current_password": self.password, "new_password": "  student-new-password  ", "confirm_password": "  student-new-password  "}
        self.assertEqual(self.request("PUT", "/student/password", payload)[0], 401)
        self.assertEqual(self.request("PUT", "/student/password", payload, admin_token)[0], 401)
        self.assertEqual(self.request("PUT", "/student/password", {**payload, "current_password": "wrong"}, token)[0], 400)
        self.assertEqual(self.request("PUT", "/student/password", {**payload, "confirm_password": "mismatch"}, token)[0], 422)
        self.assertEqual(self.request("PUT", "/student/password", {**payload, "new_password": self.password, "confirm_password": self.password}, token)[0], 422)
        invalid = self.request("PUT", "/student/password", {**payload, "student_id": 2}, token)
        self.assertEqual(invalid[0], 422)
        self.assertNotIn(self.password, json.dumps(invalid[2]))
        result = self.request("PUT", "/student/password", payload, token)
        self.assertEqual(result[0], 204)
        self.assertEqual(result[1][b"cache-control"], b"no-store")
        for session in (token, second):
            self.assertEqual(self.request("GET", "/student/me", token=session)[0], 401)
            self.assertEqual(self.request("PUT", "/student/password", payload, session)[0], 401)
        self.assertEqual(self.request("GET", "/student/me", token=other)[0], 200)
        self.assertEqual(self.request("GET", "/admin/me", token=admin_token)[0], 200)
        self.assertEqual(self.request("POST", "/student/login", login)[0], 401)
        self.assertEqual(self.request("POST", "/student/login", {**login, "password": payload["new_password"]})[0], 200)

    def test_password_change_checks_current_and_revokes_all_sessions(self):
        token = self.login()[2]["access_token"]
        second = self.login()[2]["access_token"]
        payload = {"current_password": self.password, "new_password": "  new-password  ", "confirm_password": "  new-password  "}
        self.assertEqual(self.request("PUT", "/admin/settings/password", payload)[0], 401)
        self.assertEqual(self.request("PUT", "/admin/settings/password", {**payload, "current_password": "wrong"}, token)[0], 400)
        self.assertEqual(self.request("PUT", "/admin/settings/password", {**payload, "confirm_password": "mismatch"}, token)[0], 422)
        self.assertEqual(self.request("GET", "/admin/me", token=token)[0], 200)
        result = self.request("PUT", "/admin/settings/password", payload, token)
        self.assertEqual(result[0], 204)
        self.assertEqual(result[1][b"cache-control"], b"no-store")
        for session in (token, second):
            self.assertEqual(self.request("GET", "/admin/me", token=session)[0], 401)
        self.assertEqual(self.login()[0], 401)
        self.assertEqual(self.request("POST", "/admin/login", {"email": "admin@example.com", "password": payload["new_password"]})[0], 200)

    def test_classroom_throttle_preserves_account_and_shared_limits(self):
        request = Request({"type": "http", "client": ("127.0.0.1", 12345)})
        for student_number in range(300):
            admin_auth.check_login_limit(request, f"student{student_number}@example.com", "student:")
        with self.assertRaises(admin_auth.HTTPException) as caught:
            admin_auth.check_login_limit(request, "another@example.com", "student:")
        self.assertEqual(caught.exception.status_code, 429)
        admin_auth.check_login_limit(request, "faculty@example.com", "faculty:")
        self.connection.execute("DELETE FROM admin_login_limits")
        for attempt in range(10):
            admin_auth.check_login_limit(request, "student@example.com", "student:")
        with self.assertRaises(admin_auth.HTTPException) as caught:
            admin_auth.check_login_limit(request, "student@example.com", "student:")
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.headers["Retry-After"], "60")
        admin_auth.check_login_limit(request, "other@example.com", "student:")

    def test_throttling_and_database_failure(self):
        self.request("POST", "/admin/login", {"email": "admin@example.com", "password": "wrong"})
        self.connection.execute("UPDATE admin_login_limits SET attempts = 10")
        status, headers, result = self.login()
        self.assertEqual(status, 429)
        self.assertEqual(headers[b"retry-after"], b"60")
        self.connection.execute("UPDATE admin_login_limits SET window_started_at = now() - interval '2 minutes'")
        self.assertEqual(self.login()[0], 200)
        with patch.object(admin_auth, "connect_database", side_effect=psycopg.OperationalError("private database secret")):
            result = self.request("GET", "/admin/me", token=secrets.token_urlsafe(32))
        self.assertEqual(result[0], 503)
        self.assertNotIn("private database secret", json.dumps(result[2]))


if __name__ == "__main__":
    unittest.main()