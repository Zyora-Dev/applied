from contextlib import contextmanager
from pathlib import Path
import unittest
from unittest.mock import patch
from uuid import uuid4

import faculty_auth
import faculty_portal
import submissions
import psycopg
import test_admin_auth


class FacultyPortalTests(unittest.TestCase):
    request = test_admin_auth.AdminAuthTests.request

    def setUp(self):
        test_admin_auth.AdminAuthTests.setUp(self)
        directory = Path(__file__).parent
        for filename in ("faculty_management.sql", "faculty_auth.sql", "student_management.sql", "programme.sql", "submissions.sql", "faculty_portal.sql"):
            self.connection.execute((directory / filename).read_text())
        self.faculty_id = self.connection.execute(
            """INSERT INTO faculty (name, role, email, password_hash, admin_id)
            VALUES ('Instructor','Professor','faculty@example.com',%s,%s) RETURNING id""",
            (faculty_auth.password_hasher.hash(self.password), self.admin_id),
        ).fetchone()["id"]

        @contextmanager
        def test_connection():
            with self.connection.transaction():
                yield self.connection

        for module in (faculty_auth, faculty_portal, submissions):
            patched = patch.object(module, "connect_database", test_connection)
            patched.start()
            self.addCleanup(patched.stop)
        self.student_id = self.connection.execute(
            """INSERT INTO students (name,student_id,email,mobile,college,degree,year,password_hash,admin_id)
            VALUES ('Learner','ST1','learner@example.com','1234567890','College','B.Tech',3,%s,%s) RETURNING id""",
            (faculty_auth.password_hasher.hash(self.password), self.admin_id),
        ).fetchone()["id"]
        self.submission_id = uuid4()
        self.connection.execute(
            """INSERT INTO student_submissions (id,student_id,week,request_id,drive_file_id,filename,notebook,sha256)
            VALUES (%s,%s,1,%s,'notebook','Homework.ipynb',%s,%s)""",
            (self.submission_id, self.student_id, uuid4(), b'{"cells":[]}', "a" * 64),
        )

    def login(self):
        return self.request("POST", "/faculty/login", {"email": "FACULTY@example.com", "password": self.password})

    def test_login_logout_and_role_isolation(self):
        self.assertEqual(self.request("GET", "/faculty/me")[0], 401)
        status, headers, result = self.login()
        self.assertEqual(status, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertEqual(result["faculty"]["admin_id"], self.admin_id)
        token = result["access_token"]
        stored = self.connection.execute("SELECT * FROM faculty_sessions").fetchone()
        self.assertEqual(stored["token_hash"], faculty_auth.token_digest(token))
        self.assertNotEqual(stored["token_hash"], token)
        self.assertEqual(self.request("GET", "/faculty/me", token=token)[0], 200)
        for path in ("/admin/me", "/student/me"):
            self.assertEqual(self.request("GET", path, token=token)[0], 401)
        self.assertEqual(self.request("POST", "/faculty/logout", token=token)[0], 204)
        self.assertEqual(self.request("GET", "/faculty/me", token=token)[0], 401)

    def test_invalid_changed_expired_disabled_and_unassigned(self):
        wrong = self.request("POST", "/faculty/login", {"email": "faculty@example.com", "password": "wrong-password"})
        missing = self.request("POST", "/faculty/login", {"email": "missing@example.com", "password": "wrong-password"})
        self.assertEqual(wrong[0], 401)
        self.assertEqual(wrong[2], missing[2])
        token = self.login()[2]["access_token"]
        self.connection.execute("UPDATE faculty_sessions SET expires_at=now()-interval '1 second'")
        self.assertEqual(self.request("GET", "/faculty/me", token=token)[0], 401)
        token = self.login()[2]["access_token"]
        self.connection.execute("UPDATE faculty SET name='Changed'")
        self.assertEqual(self.request("GET", "/faculty/me", token=token)[0], 401)
        for change in ("is_active=FALSE", "is_active=TRUE, deleted_at=clock_timestamp()", "deleted_at=NULL, admin_id=NULL"):
            self.connection.execute("UPDATE faculty SET " + change)
            self.assertEqual(self.login()[0], 401)

    def test_monitoring_download_and_owner_isolation(self):
        token = self.login()[2]["access_token"]
        base = f"/faculty/students/{self.student_id}"
        paths = ["/faculty/students/", base, base + "/submissions", base + f"/submissions/{self.submission_id}/download",
                 base + f"/submissions/{self.submission_id}/reviews"]
        for path in paths:
            self.assertEqual(self.request("GET", path)[0], 401)
            self.assertEqual(self.request("GET", path, token=token)[0], 200)
        listing = self.request("GET", paths[0], token=token)[2]
        self.assertEqual(listing["total"], 1)
        self.assertEqual(listing["items"][0]["submissions"][0]["kind"], "homework")
        self.assertNotIn("password_hash", listing["items"][0])
        self.assertEqual(self.request("GET", base + "/submissions?kind=practical", token=token)[2]["total"], 0)
        download = self.request("GET", paths[3], token=token)
        self.assertEqual(download[2], {"cells": []})
        self.assertEqual(download[1][b"content-security-policy"], b"sandbox")
        other_admin = self.connection.execute("INSERT INTO admins (email,password_hash) VALUES ('other@example.com','unused') RETURNING id").fetchone()["id"]
        self.connection.execute("UPDATE students SET admin_id=%s", (other_admin,))
        self.assertEqual(self.request("GET", paths[0], token=token)[2]["total"], 0)
        for path in paths[1:]:
            self.assertEqual(self.request("GET", path, token=token)[0], 404)
        self.assertEqual(self.request("POST", paths[-1], {"score": 75, "feedback": "Good"}, token)[0], 404)

    def test_grading_history_conflicts_and_student_feedback(self):
        token = self.login()[2]["access_token"]
        path = f"/faculty/students/{self.student_id}/submissions/{self.submission_id}/reviews"
        payload = {"score": 85, "feedback": "Correct calculations. Explain the tensor shape."}
        status, headers, first = self.request("POST", path, payload, token)
        self.assertEqual(status, 201)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertEqual(self.request("POST", path, payload, token)[0], 409)
        second = self.request("POST", path, {**payload, "score": 92, "expected_review_id": first["id"]}, token)[2]
        history = self.request("GET", path, token=token)[2]
        self.assertEqual(history["total"], 2)
        self.assertEqual([item["score"] for item in history["items"]], [92, 85])
        self.connection.execute("INSERT INTO programme_weeks (admin_id,week,is_open) VALUES (%s,1,TRUE)", (self.admin_id,))
        student_token = self.request("POST", "/student/login", {"email": "learner@example.com", "password": self.password})[2]["access_token"]
        receipt = self.request("GET", "/student/submissions/1", token=student_token)[2]["items"][0]
        self.assertEqual(receipt["review"]["id"], second["id"])
        self.assertEqual(receipt["review"]["score"], 92)
        self.assertEqual(self.request("POST", path, payload, student_token)[0], 401)
        with self.assertRaises(psycopg.Error), self.connection.transaction():
            self.connection.execute("UPDATE submission_reviews SET score=0")

    def test_filters_validation_and_missing_records(self):
        token = self.login()[2]["access_token"]
        base = f"/faculty/students/{self.student_id}"
        for query in ("start=2026-10-01&end=2026-09-01", "end=9999-12-31", "page=0"):
            self.assertEqual(self.request("GET", "/faculty/students/?" + query, token=token)[0], 422)
        for query in ("search=missing", "end=2000-01-01"):
            self.assertEqual(self.request("GET", "/faculty/students/?" + query, token=token)[2]["total"], 0)
        self.assertEqual(self.request("GET", base + "/submissions?kind=invalid", token=token)[0], 422)
        self.assertEqual(self.request("GET", base + f"/submissions/{uuid4()}/download", token=token)[0], 404)
        path = base + f"/submissions/{self.submission_id}/reviews"
        for payload in ({"score": -1, "feedback": "Text"}, {"score": 101, "feedback": "Text"}, {"score": True, "feedback": "Text"},
                        {"score": 75, "feedback": "   "}, {"score": 75, "feedback": "Text", "faculty_id": 99}):
            self.assertEqual(self.request("POST", path, payload, token)[0], 422)