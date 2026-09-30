import json
from pathlib import Path
import secrets
import unittest
from unittest.mock import patch

import admin_auth
import faculty
from test_admin_auth import AdminAuthTests


class FacultyTests(unittest.TestCase):
    request = AdminAuthTests.request
    login = AdminAuthTests.login

    def setUp(self):
        AdminAuthTests.setUp(self)
        self.connection.execute((Path(__file__).parent / "faculty_management.sql").read_text())
        connection_patch = patch.object(faculty, "connect_database", admin_auth.connect_database)
        connection_patch.start()
        self.addCleanup(connection_patch.stop)
        self.token = self.login()[2]["access_token"]
        self.payload = {"name": "Test Faculty", "role": "Principal", "email": "faculty@example.com", "is_active": True, "password": "  faculty-password-123  "}

    def create(self, **changes):
        return self.request("POST", "/admin/faculty/", {**self.payload, **changes}, self.token)

    def test_crud_roles_password_and_archive(self):
        status, headers, record = self.create()
        self.assertEqual(status, 201)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertNotIn("password", json.dumps(record))
        path = f"/admin/faculty/{record['id']}"
        self.assertEqual(self.request("GET", path, token=self.token)[2]["role"], "Principal")
        original = self.connection.execute("SELECT * FROM faculty WHERE id=%s", (record["id"],)).fetchone()
        self.assertTrue(admin_auth.password_hasher.verify(original["password_hash"], self.payload["password"]))
        update = {key: value for key, value in self.payload.items() if key != "password"}
        for role in ["Principal", "HOD", "Professor", "Asst. Professor"]:
            result = self.request("PUT", path, {**update, "role": role, "is_active": False}, self.token)
            self.assertEqual(result[0], 200)
            self.assertEqual(result[2]["role"], role)
            self.assertEqual(result[2]["created_at"], record["created_at"])
        stored = self.connection.execute("SELECT * FROM faculty WHERE id=%s", (record["id"],)).fetchone()
        self.assertEqual(stored["password_hash"], original["password_hash"])
        self.assertEqual(stored["admin_id"], self.admin_id)
        password = "  replacement-password  "
        self.assertEqual(self.request("POST", path + "/password", {"password": password}, self.token)[0], 204)
        hashed = self.connection.execute("SELECT password_hash FROM faculty WHERE id=%s", (record["id"],)).fetchone()["password_hash"]
        self.assertTrue(admin_auth.password_hasher.verify(hashed, password))
        self.assertEqual(self.request("DELETE", path, token=self.token)[0], 204)
        self.assertEqual(self.request("GET", path, token=self.token)[0], 404)
        self.assertEqual(self.request("POST", path + "/password", {"password": password}, self.token)[0], 404)
        self.assertEqual(self.request("GET", "/admin/faculty/", token=self.token)[2]["total"], 0)
        archived = self.connection.execute("SELECT deleted_at, is_active FROM faculty WHERE id=%s", (record["id"],)).fetchone()
        self.assertIsNotNone(archived["deleted_at"])
        self.assertFalse(archived["is_active"])
        self.assertEqual(self.create()[0], 409)

    def test_authentication_and_ownership(self):
        record = self.create()[2]
        other_id = self.connection.execute("INSERT INTO admins (email, password_hash) VALUES ('other@example.com', 'unused') RETURNING id").fetchone()["id"]
        other_token = secrets.token_urlsafe(32)
        self.connection.execute(
            """INSERT INTO admin_sessions (token_hash, admin_id, admin_updated_at, expires_at)
            SELECT %s, id, updated_at, now() + interval '1 hour' FROM admins WHERE id=%s""",
            (admin_auth.token_digest(other_token), other_id),
        )
        path = f"/admin/faculty/{record['id']}"
        update = {key: value for key, value in self.payload.items() if key != "password"}
        for method, endpoint, payload in [("GET", path, None), ("PUT", path, update), ("DELETE", path, None), ("POST", path + "/password", {"password": "new-password"})]:
            self.assertEqual(self.request(method, endpoint, payload)[0], 401)
            self.assertEqual(self.request(method, endpoint, payload, other_token)[0], 404)
        self.assertEqual(self.request("GET", "/admin/faculty/", token=other_token)[2]["items"], [])
        self.assertEqual(self.request("POST", "/admin/faculty/", self.payload)[0], 401)

    def test_role_validation_duplicates_and_secrets(self):
        self.assertEqual(self.create()[0], 201)
        self.assertEqual(self.create(email="FACULTY@example.com")[0], 409)
        for change in [{"role": "Dean"}, {"role": "principal"}, {"role": ""}, {"name": " "}, {"email": "invalid"}, {"password": "short"}, {"admin_id": 100}, {"is_active": "yes"}]:
            response = self.create(**change)
            self.assertEqual(response[0], 422)
            self.assertNotIn(self.payload["password"], json.dumps(response[2]))
        for index, role in enumerate(["HOD", "Professor", "Asst. Professor"]):
            self.assertEqual(self.create(role=role, email=f"faculty{index}@example.com")[0], 201)

    def test_search_dates_and_pagination(self):
        first = self.create()[2]
        self.create(name="Second Faculty", role="HOD", email="second@example.com")
        self.connection.execute("ALTER TABLE faculty DISABLE TRIGGER faculty_updated_at")
        self.connection.execute("UPDATE faculty SET created_at='2026-09-01 01:00:00+05:30' WHERE id=%s", (first["id"],))
        self.connection.execute("ALTER TABLE faculty ENABLE TRIGGER faculty_updated_at")
        self.assertEqual(self.request("GET", "/admin/faculty/?search=Principal", token=self.token)[2]["total"], 1)
        self.assertEqual(self.request("GET", "/admin/faculty/?search=%25", token=self.token)[2]["total"], 0)
        result = self.request("GET", "/admin/faculty/?page_size=1&page=2", token=self.token)[2]
        self.assertEqual(result["total"], 2)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(self.request("GET", "/admin/faculty/?date_from=2026-09-01&date_to=2026-09-01", token=self.token)[2]["total"], 1)
        self.assertEqual(self.request("GET", "/admin/faculty/?date_from=2026-09-02&date_to=2026-09-01", token=self.token)[0], 422)
        self.assertEqual(self.request("GET", "/admin/faculty/?page=0", token=self.token)[0], 422)


if __name__ == "__main__":
    unittest.main()