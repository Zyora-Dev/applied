import json
from io import StringIO
from pathlib import Path
import secrets
import unittest
from unittest.mock import patch

import admin_auth
import students
from import_students import import_students, read_students
from test_admin_auth import AdminAuthTests


class StudentTests(unittest.TestCase):
    request = AdminAuthTests.request
    login = AdminAuthTests.login

    def setUp(self):
        AdminAuthTests.setUp(self)
        self.connection.execute((Path(__file__).parent / "student_management.sql").read_text())
        connection_patch = patch.object(students, "connect_database", admin_auth.connect_database)
        connection_patch.start()
        self.addCleanup(connection_patch.stop)
        self.token = self.login()[2]["access_token"]
        self.payload = {
            "name": "Test Student", "student_id": "ST-001", "email": "student@example.com",
            "mobile": "+91 9876543210", "college": "Test College", "degree": "Mechanical Engineering",
            "year": 2, "github": "https://github.com/example", "linkedin": None,
            "is_active": True, "gender": "Female", "password": "  test-password-123  ",
        }

    def create(self, **changes):
        return self.request("POST", "/admin/students/", {**self.payload, **changes}, self.token)

    def test_crud_reset_and_private_responses(self):
        status, headers, student = self.create()
        self.assertEqual(status, 201)
        self.assertEqual(student["gender"], "Female")
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertNotIn("password", json.dumps(student))
        path = f"/admin/students/{student['id']}"
        self.assertEqual(self.request("GET", path, token=self.token)[2]["name"], "Test Student")
        updated = {key: value for key, value in self.payload.items() if key != "password"}
        updated.update(name="Updated Student", is_active=False, gender="Prefer not to say")
        result = self.request("PUT", path, updated, self.token)
        self.assertEqual(result[0], 200)
        self.assertEqual(result[2]["name"], "Updated Student")
        self.assertEqual(result[2]["gender"], "Prefer not to say")
        self.assertEqual(result[2]["created_at"], student["created_at"])
        self.assertNotEqual(result[2]["updated_at"], student["updated_at"])
        new_password = "  replacement-password  "
        self.assertEqual(self.request("POST", path + "/password", {"password": new_password}, self.token)[0], 204)
        stored = self.connection.execute("SELECT * FROM students WHERE id=%s", (student["id"],)).fetchone()
        self.assertTrue(admin_auth.password_hasher.verify(stored["password_hash"], new_password))
        self.assertEqual(stored["admin_id"], self.admin_id)
        self.assertEqual(self.request("DELETE", path, token=self.token)[0], 204)
        self.assertEqual(self.request("GET", path, token=self.token)[0], 404)
        self.assertEqual(self.request("POST", path + "/password", {"password": new_password}, self.token)[0], 404)
        self.assertEqual(self.request("GET", "/admin/students/", token=self.token)[2]["total"], 0)
        archived = self.connection.execute("SELECT deleted_at, is_active FROM students WHERE id=%s", (student["id"],)).fetchone()
        self.assertIsNotNone(archived["deleted_at"])
        self.assertFalse(archived["is_active"])

    def test_authentication_and_owner_isolation(self):
        student = self.create()[2]
        other_id = self.connection.execute(
            "INSERT INTO admins (email, password_hash) VALUES ('other@example.com', 'unused') RETURNING id"
        ).fetchone()["id"]
        other_token = secrets.token_urlsafe(32)
        self.connection.execute(
            """INSERT INTO admin_sessions (token_hash, admin_id, admin_updated_at, expires_at)
            SELECT %s, id, updated_at, now() + interval '1 hour' FROM admins WHERE id=%s""",
            (admin_auth.token_digest(other_token), other_id),
        )
        path = f"/admin/students/{student['id']}"
        update = {key: value for key, value in self.payload.items() if key != "password"}
        for method, endpoint, payload in [("GET", path, None), ("PUT", path, update), ("DELETE", path, None), ("POST", path + "/password", {"password": "new-password"})]:
            self.assertEqual(self.request(method, endpoint, payload)[0], 401)
            self.assertEqual(self.request(method, endpoint, payload, other_token)[0], 404)
        self.assertEqual(self.request("GET", "/admin/students/", token=other_token)[2]["items"], [])
        self.assertEqual(self.request("POST", "/admin/students/", self.payload)[0], 401)

    def test_duplicate_and_invalid_payloads(self):
        self.assertEqual(self.create()[0], 201)
        self.assertEqual(self.create(student_id="OTHER", email="STUDENT@example.com")[0], 409)
        self.assertEqual(self.create(email="other@example.com")[0], 409)
        for change in [{"name": " "}, {"year": 0}, {"year": True}, {"gender": "invalid"}, {"github": "javascript:alert(1)"}, {"password": "short"}, {"admin_id": 100}, {"linkedin": "https://user:secret@example.com"}]:
            response = self.create(**change)
            self.assertEqual(response[0], 422)
            self.assertNotIn(self.payload["password"], json.dumps(response[2]))
        self.assertEqual(self.request("GET", "/admin/students/", token=self.token)[2]["total"], 1)

    def test_csv_import_is_inactive_without_email_and_rejects_duplicates(self):
        source = "SI.NO,REGISTER NUMBER,Student Name,GENDER,MOBILE,Email ID\n1,001234,Import Student,FEMALE,09876543210,import@example.com\n2,001235,Second Student,MALE,09876543211,second@example.com\n"
        records = read_students(StringIO(source), college="Test College", degree="B.Tech, AI&DS", year=3)
        with patch.object(students, "send_account_email", side_effect=AssertionError("Import must not send email")) as send:
            imported = import_students(self.connection, records, self.admin_id)
            send.assert_not_called()
        saved = self.connection.execute("SELECT * FROM students WHERE id = ANY(%s) ORDER BY id", (imported,)).fetchall()
        self.assertEqual(len(saved), 2)
        self.assertEqual(saved[0]["student_id"], "001234")
        self.assertEqual(saved[0]["mobile"], "09876543210")
        self.assertEqual(saved[0]["gender"], "Female")
        self.assertTrue(all(not record["is_active"] and record["admin_id"] == self.admin_id for record in saved))
        self.assertTrue(all(record["password_hash"].startswith("$argon2id$") for record in saved))
        self.assertNotEqual(saved[0]["password_hash"], saved[1]["password_hash"])
        with self.assertRaisesRegex(ValueError, "existing records conflict"):
            import_students(self.connection, records, self.admin_id)
        self.assertEqual(self.connection.execute("SELECT count(*) AS total FROM students").fetchone()["total"], 2)
        with self.assertRaisesRegex(ValueError, "duplicate register number or email"):
            read_students(StringIO(source.replace("001235", "001234")), college="Test College", degree="B.Tech, AI&DS", year=3)
        with self.assertRaisesRegex(ValueError, "invalid email"):
            read_students(StringIO(source.replace("import@example.com", "invalid")), college="Test College", degree="B.Tech, AI&DS", year=3)

    def test_csv_import_rolls_back_the_batch_and_checks_owner(self):
        records = [students.StudentInput.model_validate({key: value for key, value in self.payload.items() if key != "password"}).model_copy(update={"is_active": False})]
        with self.assertRaisesRegex(ValueError, "active admin"):
            import_students(self.connection, records, -1)
        records.append(records[0].model_copy(update={"student_id": "ST-002", "email": "second@example.com", "is_active": True}))
        with self.assertRaisesRegex(ValueError, "remain inactive"):
            import_students(self.connection, records, self.admin_id)
        self.assertEqual(self.connection.execute("SELECT count(*) AS total FROM students").fetchone()["total"], 0)

    def test_search_dates_and_pagination(self):
        first = self.create()[2]
        self.create(student_id="ST-002", email="second@example.com", name="Second Student")
        self.connection.execute("ALTER TABLE students DISABLE TRIGGER students_updated_at")
        self.connection.execute("UPDATE students SET created_at='2026-09-01 01:00:00+05:30' WHERE id=%s", (first["id"],))
        self.connection.execute("ALTER TABLE students ENABLE TRIGGER students_updated_at")
        result = self.request("GET", "/admin/students/?search=ST-001", token=self.token)[2]
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], first["id"])
        self.assertEqual(self.request("GET", "/admin/students/?search=%25", token=self.token)[2]["total"], 0)
        result = self.request("GET", "/admin/students/?page_size=1&page=2", token=self.token)[2]
        self.assertEqual(result["total"], 2)
        self.assertEqual(len(result["items"]), 1)
        result = self.request("GET", "/admin/students/?date_from=2026-09-01&date_to=2026-09-01", token=self.token)[2]
        self.assertEqual(result["total"], 1)
        self.assertEqual(self.request("GET", "/admin/students/?date_from=2026-09-02&date_to=2026-09-01", token=self.token)[0], 422)
        self.assertEqual(self.request("GET", "/admin/students/?page=0", token=self.token)[0], 422)

    def test_invitation_activation_and_reuse(self):
        student = self.create(is_active=False)[2]
        path = f"/admin/students/{student['id']}/invitation"
        with patch.dict("os.environ", {"STUDENT_APP_ORIGIN": "https://students.example.com"}), patch.object(students, "get_delivery_settings", return_value={"configured": True}), patch.object(students, "send_invitation_email", return_value="accepted") as mail:
            self.assertEqual(self.request("POST", path, {}, self.token)[0], 200)
            token = mail.call_args.args[3].split("#token=")[1]
            self.assertNotIn(token, json.dumps(self.request("GET", f"/admin/students/{student['id']}", token=self.token)[2]))
            self.assertEqual(self.request("POST", path, {}, self.token)[0], 429)
            self.assertEqual(mail.call_count, 1)
        self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 200)
        payload = {"token": token, "password": "new-student-password", "confirm_password": "new-student-password"}
        self.assertEqual(self.request("POST", "/student/setup-password", {**payload, "confirm_password": "does-not-match"})[0], 422)
        self.assertEqual(self.request("POST", "/student/setup-password", payload)[0], 204)
        self.assertEqual(self.request("POST", "/student/setup-password", payload)[0], 400)
        self.assertEqual(self.request("POST", "/student/login", {"email": student["email"], "password": payload["password"]})[0], 200)

    def test_invitation_resend_expiry_owner_and_failure(self):
        student = self.create(is_active=False)[2]
        path = f"/admin/students/{student['id']}/invitation"
        with patch.dict("os.environ", {"STUDENT_APP_ORIGIN": "https://students.example.com"}), patch.object(students, "get_delivery_settings", return_value={"configured": True}), patch.object(students, "send_invitation_email", return_value="accepted") as mail:
            self.assertEqual(self.request("POST", path, {})[0], 401)
            self.assertEqual(self.request("POST", "/admin/students/999999/invitation", {}, self.token)[0], 404)
            self.request("POST", path, {}, self.token)
            old_token = mail.call_args.args[3].split("#token=")[1]
            self.connection.execute("UPDATE student_invitations SET created_at=now() - interval '2 minutes'")
            self.request("POST", path, {}, self.token)
            token = mail.call_args.args[3].split("#token=")[1]
            self.assertNotEqual(token, old_token)
            self.assertEqual(self.request("POST", "/student/invitation", {"token": old_token})[0], 400)
            self.connection.execute("UPDATE student_invitations SET expires_at=now() - interval '1 second'")
            self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 400)
            self.connection.execute("UPDATE student_invitations SET created_at=now() - interval '2 minutes'")
            mail.return_value = "failed"
            self.assertEqual(self.request("POST", path, {}, self.token)[2]["email_delivery"], "failed")
            self.assertEqual(self.connection.execute("SELECT count(*) AS total FROM student_invitations").fetchone()["total"], 0)
        self.assertFalse(self.connection.execute("SELECT is_active FROM students WHERE id=%s", (student["id"],)).fetchone()["is_active"])

    def test_invitation_blocks_other_owners_active_and_changed_accounts(self):
        student = self.create(is_active=False)[2]
        path = f"/admin/students/{student['id']}/invitation"
        other_id = self.connection.execute("INSERT INTO admins (email, password_hash) VALUES ('other@example.com', 'unused') RETURNING id").fetchone()["id"]
        other_token = secrets.token_urlsafe(32)
        self.connection.execute("INSERT INTO admin_sessions (token_hash, admin_id, admin_updated_at, expires_at) SELECT %s, id, updated_at, now() + interval '1 hour' FROM admins WHERE id=%s", (admin_auth.token_digest(other_token), other_id))
        with patch.dict("os.environ", {"STUDENT_APP_ORIGIN": "https://students.example.com"}), patch.object(students, "get_delivery_settings", return_value={"configured": True}), patch.object(students, "send_invitation_email", return_value="accepted") as mail:
            self.assertEqual(self.request("POST", path, {}, other_token)[0], 404)
            mail.assert_not_called()
            self.assertEqual(self.request("POST", path, {}, self.token)[0], 200)
            token = mail.call_args.args[3].split("#token=")[1]
            stored = self.connection.execute("SELECT token_hash FROM student_invitations").fetchone()["token_hash"]
            self.assertEqual(stored, admin_auth.token_digest(token))
            self.assertNotEqual(stored, token)
            self.connection.execute("UPDATE students SET email='changed@example.com' WHERE id=%s", (student["id"],))
            self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 400)
            self.connection.execute("UPDATE student_invitations SET created_at=now() - interval '2 minutes'")
            self.assertEqual(self.request("POST", path, {}, self.token)[0], 200)
            token = mail.call_args.args[3].split("#token=")[1]
            self.connection.execute("UPDATE students SET is_active=TRUE WHERE id=%s", (student["id"],))
            self.assertEqual(self.request("POST", path, {}, self.token)[0], 409)
            self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 400)
            self.connection.execute("UPDATE students SET is_active=FALSE, deleted_at=now() WHERE id=%s", (student["id"],))
            self.assertEqual(self.request("POST", path, {}, self.token)[0], 404)
            self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 400)

    def test_invitation_requires_configured_origin_and_email(self):
        student = self.create(is_active=False)[2]
        path = f"/admin/students/{student['id']}/invitation"
        with patch.object(students, "send_invitation_email") as mail:
            for origin in ("", "http://external.example", "https://user:password@example.com", "https://example.com/unexpected"):
                with patch.dict("os.environ", {"STUDENT_APP_ORIGIN": origin}):
                    self.assertEqual(self.request("POST", path, {}, self.token)[0], 503)
            with patch.dict("os.environ", {"STUDENT_APP_ORIGIN": "https://students.example.com"}):
                self.assertEqual(self.request("POST", path, {}, self.token)[0], 409)
            mail.assert_not_called()

    def test_invitation_rate_limit_allows_classroom_but_bounds_each_token(self):
        for _ in range(12):
            self.assertEqual(self.request("POST", "/student/invitation", {"token": secrets.token_urlsafe(32)})[0], 400)
        token = secrets.token_urlsafe(32)
        for _ in range(10):
            self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 400)
        self.assertEqual(self.request("POST", "/student/invitation", {"token": token})[0], 429)
        self.connection.execute("UPDATE admin_login_limits SET attempts=300 WHERE bucket_hash=%s", (admin_auth.token_digest("invitation:ip:127.0.0.1"),))
        self.assertEqual(self.request("POST", "/student/invitation", {"token": secrets.token_urlsafe(32)})[0], 429)


if __name__ == "__main__":
    unittest.main()