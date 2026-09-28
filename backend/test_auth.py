import asyncio
import hashlib
import json
import unittest
import uuid
from contextlib import contextmanager
from unittest.mock import patch

from psycopg import sql

import auth
import students
import faculty
from database import connect_database
from main import app


async def request_api(method, path, payload=None, authorization=None, query_string=""):
    body = json.dumps(payload).encode() if payload is not None else b""
    headers = [(b"content-type", b"application/json")]
    if authorization is not None:
        headers.append((b"authorization", authorization.encode()))
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
        "query_string": query_string.encode(), "root_path": "", "headers": headers,
        "client": ("127.0.0.222", 1234), "server": ("testserver", 80),
    }
    messages = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    start = next(message for message in messages if message["type"] == "http.response.start")
    content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], json.loads(content) if content else None, dict(start["headers"])


class AdminAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = "test-only-admin-password"
        cls.password_hash = auth.password_hasher.hash(cls.password)

    def setUp(self):
        self.connection = connect_database()
        self.addCleanup(self.connection.close)
        self.addCleanup(self.connection.rollback)
        schema_name = "test_admin_auth_" + uuid.uuid4().hex
        self.connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema_name)))
        self.connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema_name)))
        self.connection.execute(
            "CREATE TABLE admins (id BIGINT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)"
        )
        auth.initialize_auth_tables(self.connection)
        students.initialize_student_tables(self.connection)
        faculty.initialize_faculty_tables(self.connection)
        self.connection.execute(
            "INSERT INTO admins VALUES (%s, %s, %s)", (1, "admin@example.com", self.password_hash)
        )

        @contextmanager
        def isolated_database():
            yield self.connection

        patcher = patch("auth.connect_database", isolated_database)
        patcher.start()
        self.addCleanup(patcher.stop)
        student_patcher = patch("students.connect_database", isolated_database)
        student_patcher.start()
        self.addCleanup(student_patcher.stop)
        faculty_patcher = patch("faculty.connect_database", isolated_database)
        faculty_patcher.start()
        self.addCleanup(faculty_patcher.stop)

    def request(self, method, path, payload=None, authorization=None, query_string=""):
        return asyncio.run(request_api(method, path, payload, authorization, query_string))

    def test_students_validation_persistence_and_isolation(self):
        payload = {
            "name": "Test Student", "student_id": "test-001", "email": "student@example.com",
            "mobile": "+91 9876543210", "college": students.COLLEGE, "degree": "B.E", "stream": "ECE",
            "password": " test-student-password ",
        }
        for method, path in (("GET", "/admin/students"), ("GET", "/admin/students/summary"),
                             ("POST", "/admin/students"), ("PUT", "/admin/students/1")):
            self.assertEqual(self.request(method, path, payload if method in ("POST", "PUT") else None)[0], 401)
        authorization = "Bearer " + self.login()[1]["access_token"]
        self.assertEqual(self.request("GET", "/admin/students/summary", authorization=authorization)[1]["total"], 0)
        result = self.request("POST", "/admin/students", payload, authorization)
        self.assertEqual(result[0], 201)
        record = result[1]
        self.assertEqual(record["student_id"], "TEST-001")
        self.assertEqual(record["mobile"], "+919876543210")
        self.assertIsNone(record["github_url"])
        self.assertIsNone(record["linkedin_url"])
        self.assertNotIn("admin_id", record)
        self.assertTrue(record["password_set"])
        self.assertNotIn("password", record)
        self.assertNotIn("password_hash", record)
        original_hash = self.connection.execute("SELECT password_hash FROM students WHERE id=%s", (record["id"],)).fetchone()[0]
        self.assertTrue(auth.password_hasher.verify(original_hash, payload["password"]))
        without_password = {key: value for key, value in payload.items() if key != "password"}
        self.assertEqual(self.request("POST", "/admin/students", without_password, authorization)[0], 422)
        self.assertEqual(self.request("PUT", f"/admin/students/{record['id']}", without_password, authorization)[0], 200)
        self.assertEqual(self.connection.execute("SELECT password_hash FROM students WHERE id=%s", (record["id"],)).fetchone()[0], original_hash)
        invalid_password = self.request("PUT", f"/admin/students/{record['id']}", {**payload, "password": "secret"}, authorization)
        self.assertEqual(invalid_password[0], 422)
        self.assertNotIn("secret", json.dumps(invalid_password[1]))
        replacement = "new-student-password"
        self.assertEqual(self.request("PUT", f"/admin/students/{record['id']}", {**payload, "password": replacement}, authorization)[0], 200)
        self.assertTrue(auth.password_hasher.verify(self.connection.execute("SELECT password_hash FROM students WHERE id=%s", (record["id"],)).fetchone()[0], replacement))
        self.assertEqual(self.request("POST", "/admin/students", payload, authorization)[0], 409)
        listed = self.request("GET", "/admin/students", authorization=authorization)[1]
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["id"], record["id"])
        for field, invalid in (("email", "bad"), ("mobile", "abcdefg"), ("degree", "M.E"),
                               ("stream", "bad"), ("college", "Other"), ("name", "   "),
                               ("github_url", "https://github.com.evil.test/user"),
                               ("linkedin_url", "javascript:alert(1)")):
            self.assertEqual(self.request("POST", "/admin/students", {**payload, field: invalid}, authorization)[0], 422)
        updated = self.request("PUT", f"/admin/students/{record['id']}", {
            **payload, "degree": "B.Tech", "stream": "AI&DS",
            "github_url": "https://github.com/test-student", "linkedin_url": "https://www.linkedin.com/in/test-student",
        }, authorization)
        self.assertEqual(updated[0], 200)
        summary = self.request("GET", "/admin/students/summary", authorization=authorization)[1]
        self.assertEqual((summary["total"], summary["be"], summary["btech"]), (1, 0, 1))
        self.assertEqual(summary["streams"], [{"stream": "AI&DS", "total": 1}])
        self.assertEqual(self.request("GET", "/admin/students", authorization=authorization, query_string="search=absent")[1]["total"], 0)
        self.assertEqual(self.request("GET", "/admin/students", authorization=authorization, query_string="search=test-001")[1]["total"], 1)
        self.assertEqual(self.request("GET", "/admin/students", authorization=authorization, query_string="page=2&page_size=1")[1]["items"], [])
        self.assertEqual(self.request("GET", "/admin/students", authorization=authorization, query_string="date_from=2100-01-01")[1]["total"], 0)
        self.assertEqual(self.request("GET", "/admin/students", authorization=authorization, query_string="date_from=2100-01-01&date_to=2000-01-01")[0], 422)
        self.connection.execute("INSERT INTO admins VALUES (%s, %s, %s)", (2, "other@example.com", self.password_hash))
        other_token = self.request("POST", "/admin/login", {"email": "other@example.com", "password": self.password})[1]["access_token"]
        other_auth = "Bearer " + other_token
        self.assertEqual(self.request("GET", "/admin/students", authorization=other_auth)[1]["total"], 0)
        self.assertEqual(self.request("GET", "/admin/students/summary", authorization=other_auth)[1]["total"], 0)
        self.assertEqual(self.request("PUT", f"/admin/students/{record['id']}", payload, other_auth)[0], 404)
        self.assertEqual(self.request("POST", "/admin/students", payload, other_auth)[0], 201)

    def test_faculty_management_passwords_and_isolation(self):
        payload = {"name": " Faculty Member ", "role": "HOD", "email": " Faculty@Example.com ", "password": " test-faculty-password "}
        for method, path in (("GET", "/admin/faculty"), ("POST", "/admin/faculty"), ("PUT", "/admin/faculty/1")):
            self.assertEqual(self.request(method, path, payload if method != "GET" else None)[0], 401)
        authorization = "Bearer " + self.login()[1]["access_token"]
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization)[1]["total"], 0)
        result = self.request("POST", "/admin/faculty", payload, authorization)
        self.assertEqual(result[0], 201)
        record = result[1]
        self.assertEqual(record["email"], "faculty@example.com")
        self.assertEqual(record["name"], "Faculty Member")
        self.assertEqual(record["role"], "HOD")
        self.assertTrue(record["is_active"])
        self.assertNotIn("password", record)
        self.assertNotIn("password_hash", record)
        original_hash = self.connection.execute("SELECT password_hash FROM faculty WHERE id=%s", (record["id"],)).fetchone()[0]
        self.assertTrue(auth.password_hasher.verify(original_hash, payload["password"]))
        self.assertEqual(self.request("POST", "/admin/faculty", payload, authorization)[0], 409)
        for invalid in ({"email": "faculty@example.com"}, {**payload, "password": "secret"}, {**payload, "email": "bad"},
                {**payload, "name": "   "}, {**payload, "name": "x" * 151}, {**payload, "role": "Dean"},
                {key: value for key, value in payload.items() if key != "name"},
                {key: value for key, value in payload.items() if key != "role"}):
            result = self.request("POST", "/admin/faculty", invalid, authorization)
            self.assertEqual(result[0], 422)
            self.assertNotIn("secret", json.dumps(result[1]))
        update = {"name": "Updated Member", "role": "Asst. Professor", "email": "renamed@example.com", "is_active": False}
        result = self.request("PUT", f"/admin/faculty/{record['id']}", update, authorization)
        self.assertEqual(result[0], 200)
        self.assertFalse(result[1]["is_active"])
        self.assertEqual(result[1]["name"], update["name"])
        self.assertEqual(result[1]["role"], update["role"])
        for role in ("HOD", "Professor", "Asst. Professor", "Principal", "Director"):
            result = self.request("PUT", f"/admin/faculty/{record['id']}", {**update, "role": role}, authorization)
            self.assertEqual(result[0], 200)
            self.assertEqual(result[1]["role"], role)
        self.assertEqual(self.request("PUT", f"/admin/faculty/{record['id']}", {**update, "role": "Dean"}, authorization)[0], 422)
        self.assertEqual(self.connection.execute("SELECT password_hash FROM faculty WHERE id=%s", (record["id"],)).fetchone()[0], original_hash)
        replacement = "new-faculty-password"
        self.assertEqual(self.request("PUT", f"/admin/faculty/{record['id']}", {**update, "password": replacement, "is_active": True}, authorization)[0], 200)
        self.assertTrue(auth.password_hasher.verify(self.connection.execute("SELECT password_hash FROM faculty WHERE id=%s", (record["id"],)).fetchone()[0], replacement))
        listed = self.request("GET", "/admin/faculty", authorization=authorization)[1]
        self.assertEqual(listed["total"], 1)
        self.assertNotIn("password", json.dumps(listed))
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="search=renamed")[1]["total"], 1)
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="search=Updated")[1]["total"], 1)
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="search=Professor")[1]["total"], 1)
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="search=absent")[1]["total"], 0)
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="page=2&page_size=1")[1]["items"], [])
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="date_from=2100-01-01")[1]["total"], 0)
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=authorization, query_string="date_from=2100-01-01&date_to=2000-01-01")[0], 422)
        second = self.request("POST", "/admin/faculty", {**payload, "email": "second@example.com"}, authorization)[1]
        self.assertEqual(self.request("PUT", f"/admin/faculty/{second['id']}", update, authorization)[0], 409)
        self.connection.execute("UPDATE faculty SET name=NULL, role=NULL WHERE id=%s", (second["id"],))
        faculty.initialize_faculty_tables(self.connection)
        faculty.initialize_faculty_tables(self.connection)
        legacy = next(item for item in self.request("GET", "/admin/faculty", authorization=authorization)[1]["items"] if item["id"] == second["id"])
        self.assertIsNone(legacy["name"])
        self.assertIsNone(legacy["role"])
        self.assertEqual(self.request("PUT", f"/admin/faculty/{second['id']}", {**update, "email": second["email"]}, authorization)[0], 200)
        self.connection.execute("INSERT INTO admins VALUES (%s, %s, %s)", (2, "other@example.com", self.password_hash))
        other_token = self.request("POST", "/admin/login", {"email": "other@example.com", "password": self.password})[1]["access_token"]
        other_auth = "Bearer " + other_token
        self.assertEqual(self.request("GET", "/admin/faculty", authorization=other_auth)[1]["total"], 0)
        self.assertEqual(self.request("PUT", f"/admin/faculty/{record['id']}", update, other_auth)[0], 404)
        self.assertEqual(self.request("POST", "/admin/faculty", payload, other_auth)[0], 201)

    def login(self):
        result = self.request("POST", "/admin/login", {
            "email": " Admin@Example.com ", "password": self.password,
        })
        self.assertEqual(result[0], 200)
        return result

    def test_login_and_protected_identity(self):
        _, body, headers = self.login()
        self.assertEqual(body["token_type"], "bearer")
        self.assertEqual(body["expires_in"], 28800)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        token = body["access_token"]
        self.assertEqual(len(token), 43)
        stored_hash, remaining = self.connection.execute(
            "SELECT token_hash, EXTRACT(EPOCH FROM expires_at - CURRENT_TIMESTAMP) FROM admin_sessions"
        ).fetchone()
        self.assertEqual(stored_hash, hashlib.sha256(token.encode()).hexdigest())
        self.assertNotEqual(stored_hash, token)
        self.assertTrue(28800 <= remaining < 28860)
        result = self.request("GET", "/admin/me", authorization="Bearer " + token)
        self.assertEqual(result[0], 200)
        self.assertEqual(result[1], {"id": 1, "email": "admin@example.com"})
        self.assertEqual(result[2][b"cache-control"], b"no-store")
        self.assertNotIn(self.password, json.dumps(body))
        self.assertNotIn(self.password_hash, json.dumps(body))

    def test_protected_routes_reject_missing_or_invalid_tokens(self):
        for header in (None, "Basic abc", "Bearer invalid", "Bearer " + "a" * 43):
            for method, path in (("GET", "/admin/me"), ("POST", "/admin/logout")):
                with self.subTest(header=header, path=path):
                    result = self.request(method, path, authorization=header)
                    self.assertEqual(result[0], 401)
                    self.assertEqual(result[2][b"www-authenticate"], b"Bearer")
        self.assertEqual(self.request("GET", "/health")[0], 200)

    def test_credentials_have_generic_failures(self):
        results = []
        for email, password in (
            ("admin@example.com", "wrong-password"),
            ("absent@example.com", self.password),
            ("not-an-email", self.password),
            ("' OR 1=1 --", self.password),
        ):
            result = self.request("POST", "/admin/login", {"email": email, "password": password})
            self.assertEqual(result[0], 401)
            results.append(result[1])
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM admin_sessions").fetchone()[0], 0)
        self.assertEqual(self.request("POST", "/admin/login", {"email": "admin@example.com"})[0], 422)

    def test_logout_revokes_only_current_session(self):
        first_token = self.login()[1]["access_token"]
        second_token = self.login()[1]["access_token"]
        self.assertNotEqual(first_token, second_token)
        result = self.request("POST", "/admin/logout", authorization="Bearer " + first_token)
        self.assertEqual(result[0], 204)
        self.assertIsNone(result[1])
        self.assertEqual(self.request("GET", "/admin/me", authorization="Bearer " + first_token)[0], 401)
        self.assertEqual(self.request("GET", "/admin/me", authorization="Bearer " + second_token)[0], 200)

    def test_expired_sessions_and_deleted_admin_are_rejected(self):
        token = self.login()[1]["access_token"]
        self.connection.execute("UPDATE admin_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'")
        self.assertEqual(self.request("GET", "/admin/me", authorization="Bearer " + token)[0], 401)
        token = self.login()[1]["access_token"]
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM admin_sessions").fetchone()[0], 1)
        self.connection.execute("DELETE FROM admins WHERE id = 1")
        self.assertEqual(self.request("GET", "/admin/me", authorization="Bearer " + token)[0], 401)

    def test_login_limit_and_window_reset(self):
        self.connection.execute(
            "INSERT INTO admin_login_limits VALUES (%s, CURRENT_TIMESTAMP, 10)",
            (hashlib.sha256(b"127.0.0.222").hexdigest(),),
        )
        payload = {"email": "admin@example.com", "password": self.password}
        result = self.request("POST", "/admin/login", payload)
        self.assertEqual(result[0], 429)
        self.assertEqual(result[2][b"retry-after"], b"60")
        self.assertEqual(self.connection.execute("SELECT COUNT(*) FROM admin_sessions").fetchone()[0], 0)
        self.connection.execute("UPDATE admin_login_limits SET window_started = CURRENT_TIMESTAMP - INTERVAL '2 minutes'")
        self.assertEqual(self.request("POST", "/admin/login", payload)[0], 200)


if __name__ == "__main__":
    unittest.main()