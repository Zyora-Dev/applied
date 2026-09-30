import hashlib
import io
import json
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

import psycopg
from fastapi import HTTPException

import admin_auth
import submissions
from test_google_drive import GoogleDriveTests


class SubmissionTests(unittest.TestCase):
    request = GoogleDriveTests.request
    login = GoogleDriveTests.login
    student_login = GoogleDriveTests.student_login
    begin = GoogleDriveTests.begin
    finish = GoogleDriveTests.finish

    def setUp(self):
        GoogleDriveTests.setUp(self)
        for filename in ["student_management.sql", "programme.sql", "submissions.sql", "faculty_portal.sql"]:
            self.connection.execute((Path(__file__).parent / filename).read_text())
        self.connection.execute("UPDATE students SET admin_id=%s", (self.admin_id,))
        self.student_token = self.student_login()
        self.connection.execute("INSERT INTO programme_weeks (admin_id, week, is_open) VALUES (%s,1,TRUE)", (self.admin_id,))
        replacement = patch.object(submissions, "connect_database", admin_auth.connect_database)
        replacement.start()
        self.addCleanup(replacement.stop)
        self.finish(self.begin()["state"], code="code")
        self.payload = {"file_id": "selected-notebook", "request_id": str(uuid4())}
        self.content = json.dumps({"nbformat": 4, "nbformat_minor": 4, "metadata": {}, "cells": [
            {"cell_type": "code", "metadata": {}, "source": "print('student work')", "outputs": [], "execution_count": None},
        ]}).encode()
        refresh = patch.object(submissions, "refresh_access", return_value=("private-access", 3600,
            self.connection.execute("SELECT refresh_token_encrypted FROM student_google_drive").fetchone()["refresh_token_encrypted"]))
        self.refresh = refresh.start()
        self.addCleanup(refresh.stop)
        downloader = patch.object(submissions, "download_notebook", return_value=("Homework.ipynb", self.content))
        self.downloader = downloader.start()
        self.addCleanup(downloader.stop)

    def save(self, payload=None):
        return self.request("POST", "/student/submissions/1", payload or self.payload, self.student_token)

    def test_receipt_retry_history_download_and_immutability(self):
        status, headers, receipt = self.save()
        self.assertEqual(status, 201)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertEqual(set(receipt), {"id", "week", "kind", "filename", "sha256", "submitted_at", "size_bytes"})
        self.assertEqual(receipt["sha256"], hashlib.sha256(self.content).hexdigest())
        self.assertEqual(receipt["size_bytes"], len(self.content))
        self.assertEqual(self.save()[0:3:2], (200, receipt))
        self.downloader.assert_called_once()
        self.assertEqual(self.save({**self.payload, "file_id": "other"})[0], 409)
        history = self.request("GET", "/student/submissions/1", token=self.student_token)[2]
        self.assertEqual(history["items"], [{**receipt, "review": None}])
        self.assertEqual(history["total"], 1)
        path = f'/student/submissions/1/{receipt["id"]}/download'
        status, headers, notebook = self.request("GET", path, token=self.student_token)
        self.assertEqual(status, 200)
        self.assertEqual(notebook, json.loads(self.content))
        self.assertIn(b"attachment", headers[b"content-disposition"])
        self.assertEqual(headers[b"x-content-type-options"], b"nosniff")
        self.assertEqual(headers[b"content-security-policy"], b"sandbox")
        for statement in ["UPDATE student_submissions SET filename='changed.ipynb'", "DELETE FROM student_submissions"]:
            with self.assertRaises(psycopg.Error), self.connection.transaction():
                self.connection.execute(statement)
        self.connection.execute("DELETE FROM student_google_drive")
        self.assertEqual(self.save()[2], receipt)
        self.assertEqual(self.request("GET", path, token=self.student_token)[0], 200)

    def test_auth_week_validation_and_student_isolation(self):
        for method in ["GET", "POST"]:
            self.assertEqual(self.request(method, "/student/submissions/1", self.payload if method == "POST" else None)[0], 401)
            self.assertEqual(self.request(method, "/student/submissions/2", self.payload if method == "POST" else None, self.student_token)[0], 403)
        for payload in [{**self.payload, "file_id": "../escape"}, {**self.payload, "request_id": "bad"}, {**self.payload, "student_id": 1}]:
            self.assertEqual(self.save(payload)[0], 422)
        receipt = self.save()[2]
        self.connection.execute(
            """INSERT INTO students (admin_id,name,student_id,email,mobile,password_hash,college,degree,year)
            VALUES (%s,'Other','OTHER','other@example.com','1234567890',%s,'College','Civil',2)""",
            (self.admin_id, admin_auth.password_hasher.hash(self.password)),
        )
        other = self.request("POST", "/student/login", {"email": "other@example.com", "password": self.password})[2]["access_token"]
        self.assertEqual(self.request("GET", "/student/submissions/1", token=other)[2]["total"], 0)
        self.assertEqual(self.request("GET", f'/student/submissions/1/{receipt["id"]}/download', token=other)[0], 404)

    def test_access_changes_during_download_prevent_save(self):
        for statement, expected in [
            ("DELETE FROM student_sessions", 401),
            ("UPDATE students SET is_active=FALSE", 401),
            ("UPDATE programme_weeks SET is_open=FALSE", 403),
            ("DELETE FROM student_google_drive", 409),
            ("UPDATE student_google_drive SET refresh_token_encrypted='replaced'", 409),
        ]:
            with self.subTest(statement=statement), self.connection.transaction(force_rollback=True):
                def changed(file_id, access_token):
                    self.connection.execute(statement)
                    return "Homework.ipynb", self.content
                self.downloader.side_effect = changed
                self.assertEqual(self.save()[0], expected)
                self.assertEqual(self.connection.execute("SELECT count(*) AS total FROM student_submissions").fetchone()["total"], 0)

    def test_limits_pagination_and_dates(self):
        for _ in range(20):
            self.assertEqual(self.save({**self.payload, "request_id": str(uuid4())})[0], 201)
        self.assertEqual(self.save()[0], 409)
        self.assertEqual(self.downloader.call_count, 20)
        for page, size in [(1, 10), (2, 10), (3, 0)]:
            result = self.request("GET", f"/student/submissions/1?page={page}", token=self.student_token)[2]
            self.assertEqual(len(result["items"]), size)
            self.assertEqual(result["total"], 20)
        for query in ["start=2026-02-30", "start=2026-10-01&end=2026-09-01", "page=0", "end=9999-12-31"]:
            self.assertEqual(self.request("GET", "/student/submissions/1?" + query, token=self.student_token)[0], 422)
        self.assertEqual(self.request("GET", "/student/submissions/1?end=2000-01-01", token=self.student_token)[2]["total"], 0)

    def test_practical_and_homework_are_separate(self):
        homework = self.save()[2]
        practical = self.save({**self.payload, "request_id": str(uuid4()), "kind": "practical"})[2]
        self.assertEqual(homework["kind"], "homework")
        self.assertEqual(practical["kind"], "practical")
        self.assertEqual(self.save({**self.payload, "kind": "practical"})[0], 409)
        for kind, receipt in [("homework", homework), ("practical", practical)]:
            history = self.request("GET", "/student/submissions/1?kind=" + kind, token=self.student_token)[2]
            self.assertEqual(history["items"], [{**receipt, "review": None}])
        self.assertEqual(self.save({**self.payload, "kind": "other"})[0], 422)


class NotebookDownloadTests(unittest.TestCase):
    def setUp(self):
        self.content = b'{"nbformat":4,"nbformat_minor":4,"metadata":{},"cells":[]}'
        self.metadata = {"id": "file", "name": "Notebook.ipynb", "mimeType": "application/octet-stream",
                         "size": str(len(self.content)), "version": "1", "trashed": False,
                         "md5Checksum": hashlib.md5(self.content, usedforsecurity=False).hexdigest()}

    def test_valid_notebook_and_validation_failures(self):
        with patch.object(submissions, "drive_get", side_effect=[json.dumps(self.metadata).encode(), self.content, json.dumps(self.metadata).encode()]):
            self.assertEqual(submissions.download_notebook("file", "secret"), ("Notebook.ipynb", self.content))
        for content in [b"not JSON", b"{}", b'{"nbformat":4,"nbformat_minor":4,"metadata":{},"cells":[{}]}',
                        b'{"nbformat":4,"nbformat_minor":4,"metadata":{"value":NaN},"cells":[]}']:
            metadata = {**self.metadata, "size": str(len(content)), "md5Checksum": hashlib.md5(content, usedforsecurity=False).hexdigest()}
            with patch.object(submissions, "drive_get", side_effect=[json.dumps(metadata).encode(), content, json.dumps(metadata).encode()]), self.assertRaises(HTTPException) as caught:
                submissions.download_notebook("file", "secret")
            self.assertEqual(caught.exception.status_code, 422)
        for changes, expected in [({"name": "report.pdf"}, 422), ({"mimeType": "application/vnd.google-apps.shortcut"}, 422),
                                  ({"trashed": True}, 422), ({"id": "other"}, 422), ({"size": str(submissions.MAX_BYTES + 1)}, 413)]:
            with patch.object(submissions, "drive_get", return_value=json.dumps({**self.metadata, **changes}).encode()), self.assertRaises(HTTPException) as caught:
                submissions.download_notebook("file", "secret")
            self.assertEqual(caught.exception.status_code, expected)
        with patch.object(submissions, "drive_get", side_effect=[json.dumps(self.metadata).encode(), self.content, json.dumps({**self.metadata, "version": "2"}).encode()]), self.assertRaises(HTTPException) as caught:
            submissions.download_notebook("file", "secret")
        self.assertEqual(caught.exception.status_code, 409)

    def test_transport_limits_fixed_host_and_sanitized_errors(self):
        with patch.object(submissions, "build_opener") as opener:
            response = MagicMock()
            opener.return_value.open.return_value.__enter__.return_value = response
            response.read.return_value = b"bytes"
            self.assertEqual(submissions.drive_get("file", "private-token", {"alt": "media"}, 100), b"bytes")
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, "https://www.googleapis.com/drive/v3/files/file?alt=media")
            self.assertEqual(request.get_header("Authorization"), "Bearer private-token")
            self.assertEqual(opener.return_value.open.call_args.kwargs["timeout"], 10)
            response.read.assert_called_once_with(101)
            response.read.return_value = b"x" * 101
            with self.assertRaises(HTTPException) as caught:
                submissions.drive_get("file", "private-token", {}, 100)
            self.assertEqual(caught.exception.status_code, 413)
            for status, expected in [(401, 409), (403, 422), (404, 422), (302, 503), (500, 503)]:
                opener.return_value.open.side_effect = HTTPError(request.full_url, status, "private-message", {}, io.BytesIO(b"private-body"))
                with self.assertRaises(HTTPException) as caught:
                    submissions.drive_get("file", "private-token", {}, 100)
                self.assertEqual(caught.exception.status_code, expected)
                self.assertNotIn("private", caught.exception.detail)