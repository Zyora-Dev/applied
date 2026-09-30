import base64
import hashlib
import io
import secrets
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from cryptography.fernet import Fernet
from fastapi import HTTPException

import admin_auth
import google_drive
from test_admin_auth import AdminAuthTests


class GoogleDriveTests(unittest.TestCase):
    request = AdminAuthTests.request
    login = AdminAuthTests.login

    def setUp(self):
        AdminAuthTests.setUp(self)
        self.connection.execute((Path(__file__).parent / "google_drive.sql").read_text())
        self.connection.execute(
            """INSERT INTO students (name, student_id, email, mobile, password_hash, college, degree, year)
            VALUES ('Student', 'GD-1', 'drive@example.com', '1234567890', %s, 'College', 'Civil', 2)""",
            (admin_auth.password_hasher.hash(self.password),),
        )
        self.student_token = self.student_login()
        for replacement in [
            patch.object(google_drive, "connect_database", admin_auth.connect_database),
            patch.dict("os.environ", {"GOOGLE_CLIENT_ID": "test-client", "GOOGLE_CLIENT_SECRET": "test-secret",
                "GOOGLE_REDIRECT_URI": google_drive.LOCAL_CALLBACK, "APP_ENV": "local",
                "GOOGLE_PICKER_API_KEY": "test-picker-key", "GOOGLE_PROJECT_NUMBER": "123456",
                "GOOGLE_DRIVE_ENCRYPTION_KEY": Fernet.generate_key().decode()}),
        ]:
            replacement.start()
            self.addCleanup(replacement.stop)
        self.exchange = patch.object(google_drive, "exchange_code", return_value={
            "refresh_token": "private-refresh-token", "scope": google_drive.DRIVE_SCOPE,
        }).start()
        self.addCleanup(patch.stopall)

    def student_login(self):
        return self.request("POST", "/student/login", {"email": "drive@example.com", "password": self.password})[2]["access_token"]

    def begin(self):
        status, headers, result = self.request("POST", "/student/google-drive/connect", token=self.student_token)
        self.assertEqual(status, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        return result

    def finish(self, state, token=None, **fields):
        return self.request("POST", "/student/google-drive/callback", {"state": state, **fields}, token or self.student_token)

    def test_connection_pkce_encryption_replay_and_disconnect(self):
        self.assertEqual(self.request("GET", "/student/google-drive", token=self.student_token)[2], {"connected": False})
        result = self.begin()
        query = parse_qs(urlsplit(result["authorization_url"]).query)
        self.assertEqual(query["scope"], [google_drive.DRIVE_SCOPE])
        self.assertEqual(query["redirect_uri"], [google_drive.LOCAL_CALLBACK])
        self.assertEqual(query["access_type"], ["offline"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        stored = self.connection.execute("SELECT * FROM student_google_drive").fetchone()
        self.assertEqual(stored["state_hash"], admin_auth.token_digest(result["state"]))
        verifier = google_drive.drive_cipher().decrypt(stored["verifier_encrypted"].encode()).decode()
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        self.assertEqual(query["code_challenge"], [challenge])
        self.assertEqual(self.finish(result["state"], code="google-code")[2], {"connected": True})
        self.exchange.assert_called_once_with("google-code", verifier)
        stored = self.connection.execute("SELECT * FROM student_google_drive").fetchone()
        self.assertNotEqual(stored["refresh_token_encrypted"], "private-refresh-token")
        self.assertEqual(google_drive.drive_cipher().decrypt(stored["refresh_token_encrypted"].encode()), b"private-refresh-token")
        self.assertEqual(self.finish(result["state"], code="replay")[0], 400)
        status = self.request("GET", "/student/google-drive", token=self.student_token)
        self.assertEqual(status[2], {"connected": True})
        self.assertEqual(status[1][b"cache-control"], b"no-store")
        self.assertEqual(self.request("DELETE", "/student/google-drive", token=self.student_token)[0], 204)
        self.assertEqual(self.request("GET", "/student/google-drive", token=self.student_token)[2], {"connected": False})

    def test_wrong_session_expiry_replaced_attempt_and_authentication(self):
        for method, path in [("GET", ""), ("POST", "/connect"), ("POST", "/picker"), ("DELETE", "")]:
            self.assertEqual(self.request(method, "/student/google-drive" + path)[0], 401)
            self.assertEqual(self.request(method, "/student/google-drive" + path, token=self.login()[2]["access_token"])[0], 401)
        state = self.begin()["state"]
        self.assertEqual(self.finish(state, token=self.student_login(), code="code")[0], 400)
        self.assertEqual(self.finish(secrets.token_urlsafe(32), code="code")[0], 400)
        self.begin()
        self.assertEqual(self.finish(state, code="code")[0], 400)
        state = self.begin()["state"]
        self.connection.execute("UPDATE student_google_drive SET expires_at=clock_timestamp() - interval '1 second'")
        self.assertEqual(self.finish(state, code="code")[0], 400)
        self.exchange.assert_not_called()

    def test_consent_denial_and_invalid_grants_fail_closed(self):
        state = self.begin()["state"]
        self.assertEqual(self.finish(state, error="access_denied")[0], 400)
        self.assertEqual(self.finish(state, code="code")[0], 400)
        self.exchange.assert_not_called()
        for result in [{"scope": "other", "refresh_token": "token"}, {"scope": google_drive.DRIVE_SCOPE}, {"scope": google_drive.DRIVE_SCOPE, "refresh_token": ""}]:
            self.exchange.return_value = result
            state = self.begin()["state"]
            self.assertEqual(self.finish(state, code="code")[0], 400)
            self.assertEqual(self.finish(state, code="code")[0], 400)
        self.exchange.side_effect = HTTPException(503, "Google unavailable")
        state = self.begin()["state"]
        self.assertEqual(self.finish(state, code="code")[0], 503)
        self.assertEqual(self.finish(state, code="code")[0], 400)
        self.assertEqual(self.request("GET", "/student/google-drive", token=self.student_token)[2], {"connected": False})

    def test_disconnect_or_logout_during_exchange_prevents_save(self):
        for action in [lambda: self.connection.execute("DELETE FROM student_google_drive"),
                       lambda: self.connection.execute("DELETE FROM student_sessions")]:
            state = self.begin()["state"]
            def exchange(code, verifier):
                action()
                return {"scope": google_drive.DRIVE_SCOPE, "refresh_token": "private"}
            self.exchange.side_effect = exchange
            self.assertEqual(self.finish(state, code="code")[0], 400)

    def test_configuration_rejects_insecure_production_redirect(self):
        with patch.dict("os.environ", {"APP_ENV": "production", "GOOGLE_REDIRECT_URI": google_drive.LOCAL_CALLBACK}):
            self.assertEqual(self.request("POST", "/student/google-drive/connect", token=self.student_token)[0], 503)

    def test_picker_session_requires_connection_and_returns_only_short_lived_credentials(self):
        self.assertEqual(self.request("POST", "/student/google-drive/picker", token=self.student_token)[0], 409)
        self.finish(self.begin()["state"], code="code")
        with patch.object(google_drive, "request_token", return_value={
            "access_token": "temporary-access", "expires_in": 3600, "token_type": "Bearer",
            "refresh_token": "must-not-leak",
        }) as refresh:
            status, headers, result = self.request("POST", "/student/google-drive/picker", token=self.student_token)
            self.assertEqual(status, 200)
            self.assertEqual(headers[b"cache-control"], b"no-store")
            self.assertEqual(result, {"access_token": "temporary-access", "expires_in": 3600,
                                     "api_key": "test-picker-key", "project_number": "123456"})
            self.assertEqual(refresh.call_args.args[0]["refresh_token"], "private-refresh-token")
            self.assertEqual(refresh.call_args.args[0]["grant_type"], "refresh_token")
            for invalid in [{}, {"access_token": "temporary", "expires_in": 0, "token_type": "Bearer"},
                            {"access_token": "temporary", "expires_in": 3600, "token_type": None},
                            {"access_token": "temporary", "expires_in": 3600, "token_type": "Bearer", "scope": "other"}]:
                refresh.return_value = invalid
                self.assertEqual(self.request("POST", "/student/google-drive/picker", token=self.student_token)[0], 503)

    def test_picker_disconnect_or_logout_during_refresh_prevents_token_release(self):
        for action in [lambda: self.connection.execute("DELETE FROM student_google_drive"),
                       lambda: self.connection.execute("DELETE FROM student_sessions")]:
            self.finish(self.begin()["state"], code="code")
            def refresh(fields):
                action()
                return {"access_token": "temporary", "expires_in": 3600, "token_type": "Bearer"}
            with patch.object(google_drive, "request_token", side_effect=refresh):
                status, _, result = self.request("POST", "/student/google-drive/picker", token=self.student_token)
            self.assertEqual(status, 409)
            self.assertNotIn("access_token", result)

    def test_token_transport_bounds_responses_and_sanitizes_revoked_grants(self):
        fields = {"grant_type": "refresh_token", "refresh_token": "private"}
        with patch.object(google_drive, "build_opener") as build:
            response = MagicMock()
            build.return_value.open.return_value.__enter__.return_value = response
            response.read.return_value = b'{"access_token":"temporary"}'
            self.assertEqual(google_drive.request_token(fields), {"access_token": "temporary"})
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, "https://oauth2.googleapis.com/token")
            self.assertEqual(request.method, "POST")
            self.assertEqual(parse_qs(request.data.decode()), {"grant_type": ["refresh_token"], "refresh_token": ["private"]})
            self.assertEqual(build.return_value.open.call_args.kwargs["timeout"], 10)
            response.read.assert_called_with(65_537)
            for content in [b"x" * 65_537, b"[]", b"invalid"]:
                response.read.return_value = content
                with self.assertRaises(HTTPException) as raised:
                    google_drive.request_token(fields)
                self.assertEqual(raised.exception.status_code, 503)
            for content, expected in [(b'{"error":"invalid_grant","detail":"private"}', 409),
                                      (b'{"error":"server_error","detail":"private"}', 503)]:
                build.return_value.open.side_effect = HTTPError(request.full_url, 400, "private", {}, io.BytesIO(content))
                with self.assertRaises(HTTPException) as raised:
                    google_drive.request_token(fields)
                self.assertEqual(raised.exception.status_code, expected)
                self.assertNotIn("private", raised.exception.detail)