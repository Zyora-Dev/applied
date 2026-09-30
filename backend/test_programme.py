from pathlib import Path
import secrets
import unittest
from unittest.mock import patch

import admin_auth
import programme
from test_admin_auth import AdminAuthTests


class ProgrammeTests(unittest.TestCase):
    request = AdminAuthTests.request
    login = AdminAuthTests.login

    def setUp(self):
        AdminAuthTests.setUp(self)
        directory = Path(__file__).parent
        self.connection.execute((directory / "student_management.sql").read_text())
        self.connection.execute((directory / "programme.sql").read_text())
        connection_patch = patch.object(programme, "connect_database", admin_auth.connect_database)
        connection_patch.start()
        self.addCleanup(connection_patch.stop)
        self.token = self.login()[2]["access_token"]
        self.connection.execute(
            """INSERT INTO students (admin_id, name, student_id, email, mobile, password_hash, college, degree, year)
            VALUES (%s, 'Student', 'ST-1', 'student@example.com', '1234567890', %s, 'College', 'Civil', 2)""",
            (self.admin_id, admin_auth.password_hasher.hash(self.password)),
        )
        self.student_token = self.request("POST", "/student/login", {
            "email": "student@example.com", "password": self.password,
        })[2]["access_token"]

    def test_default_locked_unlock_and_relock_direct_access(self):
        expected = [{"week": week, "is_open": False} for week in range(1, 5)]
        for path, token in [("/admin/programme", self.token), ("/student/programme", self.student_token)]:
            status, headers, result = self.request("GET", path, token=token)
            self.assertEqual(status, 200)
            self.assertEqual(headers[b"cache-control"], b"no-store")
            self.assertEqual(result, expected)
        for week in range(1, 5):
            self.assertEqual(self.request("GET", f"/student/programme/{week}", token=self.student_token)[0], 403)
        result = self.request("PUT", "/admin/programme/2", {"is_open": True}, self.token)
        self.assertEqual(result[2], {"week": 2, "is_open": True})
        self.assertEqual(self.request("GET", "/student/programme/2", token=self.student_token)[0], 200)
        self.assertTrue(self.request("GET", "/student/programme", token=self.student_token)[2][1]["is_open"])
        self.assertEqual(self.request("GET", "/student/programme/1", token=self.student_token)[0], 403)
        self.assertEqual(self.request("PUT", "/admin/programme/2", {"is_open": False}, self.token)[0], 200)
        self.assertEqual(self.request("GET", "/student/programme/2", token=self.student_token)[0], 403)
        self.assertEqual(self.request("GET", "/admin/me", token=self.token)[0], 200)

    def test_authentication_validation_and_owner_isolation(self):
        for method, path, payload in [("GET", "/admin/programme", None), ("PUT", "/admin/programme/1", {"is_open": True}), ("GET", "/student/programme", None), ("GET", "/student/programme/1", None)]:
            self.assertEqual(self.request(method, path, payload)[0], 401)
        self.assertEqual(self.request("PUT", "/admin/programme/1", {"is_open": True}, self.student_token)[0], 401)
        for week in [0, 5, "invalid"]:
            self.assertEqual(self.request("PUT", f"/admin/programme/{week}", {"is_open": True}, self.token)[0], 422)
            self.assertEqual(self.request("GET", f"/student/programme/{week}", token=self.student_token)[0], 422)
        for payload in [{"is_open": "true"}, {"is_open": 1}, {"is_open": True, "admin_id": 2}, {}]:
            self.assertEqual(self.request("PUT", "/admin/programme/1", payload, self.token)[0], 422)
        other_id = self.connection.execute(
            "INSERT INTO admins (email, password_hash) VALUES ('other@example.com', 'unused') RETURNING id"
        ).fetchone()["id"]
        other_token = secrets.token_urlsafe(32)
        self.connection.execute(
            """INSERT INTO admin_sessions (token_hash, admin_id, admin_updated_at, expires_at)
            SELECT %s, id, updated_at, now() + interval '1 hour' FROM admins WHERE id=%s""",
            (admin_auth.token_digest(other_token), other_id),
        )
        self.assertEqual(self.request("PUT", "/admin/programme/1", {"is_open": True}, other_token)[0], 200)
        self.assertFalse(self.request("GET", "/admin/programme", token=self.token)[2][0]["is_open"])
        self.assertEqual(self.request("GET", "/student/programme/1", token=self.student_token)[0], 403)
        self.connection.execute("UPDATE students SET admin_id=NULL")
        new_token = self.request("POST", "/student/login", {"email": "student@example.com", "password": self.password})[2]["access_token"]
        self.assertFalse(any(week["is_open"] for week in self.request("GET", "/student/programme", token=new_token)[2]))