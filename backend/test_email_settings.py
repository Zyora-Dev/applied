import json
import secrets
import unittest
from http.client import IncompleteRead
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from cryptography.fernet import Fernet

import admin_auth
import email_settings
import faculty
import students
from test_admin_auth import AdminAuthTests


class EmailSettingsTests(unittest.TestCase):
    request = AdminAuthTests.request
    login = AdminAuthTests.login

    def setUp(self):
        AdminAuthTests.setUp(self)
        for module in (email_settings, students, faculty):
            connection_patch = patch.object(module, "connect_database", admin_auth.connect_database)
            connection_patch.start()
            self.addCleanup(connection_patch.stop)
        key_patch = patch.dict("os.environ", {"EMAIL_SETTINGS_KEY": Fernet.generate_key().decode()})
        key_patch.start()
        self.addCleanup(key_patch.stop)
        email_settings.os.environ.pop("ZEPTOMAIL_API_URL", None)
        for migration in ("student_management.sql", "faculty_management.sql"):
            self.connection.execute((Path(__file__).parent / migration).read_text())
        self.token = self.login()[2]["access_token"]
        self.settings = {"from_name": "Applied AI", "from_email": "sender@example.com", "send_mail_token": "private-send-token"}

    def save(self, **changes):
        return self.request("PUT", "/admin/settings/email", {**self.settings, **changes}, self.token)

    def test_private_settings_encryption_preservation_and_isolation(self):
        self.assertEqual(self.request("GET", "/admin/settings/email")[0], 401)
        self.assertEqual(self.request("PUT", "/admin/settings/email", self.settings)[0], 401)
        self.assertFalse(self.request("GET", "/admin/settings/email", token=self.token)[2]["token_configured"])
        self.assertEqual(self.save(send_mail_token="")[0], 422)
        status, headers, result = self.save()
        self.assertEqual(status, 200)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertNotIn("private-send-token", json.dumps(result))
        stored = self.connection.execute("SELECT token_encrypted FROM admin_email_settings").fetchone()["token_encrypted"]
        self.assertNotIn("private-send-token", stored)
        self.assertEqual(email_settings.token_cipher().decrypt(stored.encode()).decode(), "private-send-token")
        self.assertEqual(self.save(from_name="Changed", send_mail_token="")[0], 200)
        self.assertEqual(self.connection.execute("SELECT token_encrypted FROM admin_email_settings").fetchone()["token_encrypted"], stored)
        self.assertEqual(self.save(send_mail_token="Zoho-enczapikey replacement-token")[0], 200)
        updated = self.connection.execute("SELECT token_encrypted FROM admin_email_settings").fetchone()["token_encrypted"]
        self.assertEqual(email_settings.token_cipher().decrypt(updated.encode()).decode(), "replacement-token")
        other_id = self.connection.execute("INSERT INTO admins (email, password_hash) VALUES ('other@example.com', 'unused') RETURNING id").fetchone()["id"]
        other_token = secrets.token_urlsafe(32)
        self.connection.execute("INSERT INTO admin_sessions (token_hash, admin_id, admin_updated_at, expires_at) SELECT %s, id, updated_at, now() + interval '1 hour' FROM admins WHERE id=%s", (admin_auth.token_digest(other_token), other_id))
        self.assertFalse(self.request("GET", "/admin/settings/email", token=other_token)[2]["token_configured"])
        for changes in ({"from_name": " "}, {"from_email": "bad"}, {"send_mail_token": "bad\r\ntoken"}, {"admin_id": other_id}):
            result = self.save(**changes)
            self.assertEqual(result[0], 422)
            self.assertNotIn("private-send-token", json.dumps(result[2]))

    def test_creation_sends_credentials_once_and_keeps_accounts_on_failure(self):
        self.save()
        opener = MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 200
        response.read.return_value = b'{"data":[{"code":"EM_104","message":"OK"}]}'
        payloads = [
            ("faculty", {"name": "Faculty", "role": "HOD", "email": "faculty@example.com", "password": "  account-password  "}),
            ("students", {"name": "Student", "student_id": "ST-1", "email": "student@example.com", "password": "  account-password  ", "mobile": "1234567890", "college": "College", "degree": "Civil", "year": 2}),
        ]
        with patch.object(email_settings, "build_opener", return_value=opener):
            for resource, payload in payloads:
                result = self.request("POST", f"/admin/{resource}/", payload, self.token)
                self.assertEqual(result[0], 201)
                self.assertEqual(result[2]["email_delivery"], "accepted")
                self.assertNotIn("account-password", json.dumps(result[2]))
                request = opener.open.call_args.args[0]
                body = json.loads(request.data)
                self.assertEqual(request.full_url, "https://cpaas.zoho.in/v1.1/email")
                self.assertEqual(request.get_method(), "POST")
                self.assertEqual(request.get_header("Accept"), "application/json")
                self.assertEqual(request.get_header("Content-type"), "application/json")
                self.assertEqual(body["from"], {"address": "sender@example.com", "name": "Applied AI"})
                self.assertIn("Password:   account-password  \n", body["textbody"])
                self.assertEqual(body["to"][0]["email_address"]["address"], payload["email"])
                self.assertEqual(request.get_header("Authorization"), "Zoho-enczapikey private-send-token")
                calls = opener.open.call_count
                self.assertEqual(self.request("POST", f"/admin/{resource}/", payload, self.token)[0], 409)
                self.assertEqual(opener.open.call_count, calls)
                update = {key: value for key, value in payload.items() if key != "password"}
                self.assertEqual(self.request("PUT", f"/admin/{resource}/{result[2]['id']}", update, self.token)[0], 200)
                self.assertEqual(opener.open.call_count, calls)
            opener.open.side_effect = URLError("provider secret")
            failure = self.request("POST", "/admin/faculty/", {**payloads[0][1], "email": "failed@example.com"}, self.token)
            self.assertEqual(failure[0], 201)
            self.assertEqual(failure[2]["email_delivery"], "failed")
            self.assertEqual(self.request("GET", f"/admin/faculty/{failure[2]['id']}", token=self.token)[0], 200)
            self.assertNotIn("provider secret", json.dumps(failure[2]))

    def test_unconfigured_and_invalid_provider_responses(self):
        with patch.object(email_settings, "build_opener") as factory:
            self.assertEqual(email_settings.send_account_email(None, "Test", "test@example.com", "password", "student"), "not_configured")
            factory.assert_not_called()
        self.save()
        settings = email_settings.get_delivery_settings(self.connection, self.admin_id)
        opener = MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 200
        with patch.object(email_settings, "build_opener", return_value=opener):
            for content in (b"not-json", b'{"data":[]}', b'{"data":{"error":"private"}}'):
                response.read.return_value = content
                self.assertEqual(email_settings.send_account_email(settings, "Test", "test@example.com", "password", "faculty"), "failed")
            response.read.side_effect = IncompleteRead(b"private provider response")
            self.assertEqual(email_settings.send_account_email(settings, "Test", "test@example.com", "password", "faculty"), "failed")
        with patch.dict("os.environ", {"EMAIL_SETTINGS_KEY": Fernet.generate_key().decode()}):
            self.assertEqual(email_settings.send_account_email(settings, "Test", "test@example.com", "password", "student"), "failed")

    def test_invitation_email_button_escapes_content_and_never_sends_password(self):
        self.save()
        settings = email_settings.get_delivery_settings(self.connection, self.admin_id)
        opener = MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 201
        response.read.return_value = b'{"data":[{"code":"EM_104"}]}'
        url = "https://students.example.com/student/setup-password#token=" + "a" * 43
        with patch.object(email_settings, "build_opener", return_value=opener):
            self.assertEqual(email_settings.send_invitation_email(settings, "<Student>", "student@example.com", url), "accepted")
        body = json.loads(opener.open.call_args.args[0].data)
        self.assertIn(f'href="{url}"', body["htmlbody"])
        self.assertIn("Set up password", body["htmlbody"])
        self.assertIn("&lt;Student&gt;", body["htmlbody"])
        self.assertIn(url, body["textbody"])
        self.assertNotIn("Password:", body["textbody"])
        self.assertFalse(body["track_clicks"])
        self.assertEqual(len(body["to"]), 1)