import json
import os
from html import escape
from http.client import HTTPException as HTTPClientError
from pathlib import Path
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from admin_auth import PRIVATE_HEADERS, require_admin
from database import connect_database


router = APIRouter(prefix="/admin/settings/email", tags=["Admin settings"])
Admin = Annotated[dict, Depends(require_admin)]
DeliveryStatus = Literal["accepted", "failed", "not_configured"]


class EmailSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_name: str = Field(min_length=1, max_length=150)
    from_email: EmailStr = Field(max_length=254)
    send_mail_token: SecretStr | None = Field(default=None, max_length=4096)

    @field_validator("from_name", "from_email", mode="before")
    @classmethod
    def clean_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("send_mail_token")
    @classmethod
    def clean_token(cls, value):
        if value is None:
            return None
        token = value.get_secret_value().strip()
        prefix = "Zoho-enczapikey "
        if token.startswith(prefix):
            token = token[len(prefix):]
        if not token:
            return None
        if any(character.isspace() for character in token) or not token.isascii():
            raise ValueError("Enter a valid send-mail token.")
        return SecretStr(token)


class EmailSettingsRecord(BaseModel):
    from_name: str = ""
    from_email: str = ""
    token_configured: bool = False


def token_cipher():
    configured = os.environ.get("EMAIL_SETTINGS_KEY")
    if configured:
        return Fernet(configured.encode("ascii"))
    if os.environ.get("APP_ENV", "local") != "local":
        raise ValueError("Email encryption key is not configured")
    path = Path(__file__).parent / ".secrets" / "zeptomail.key"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(descriptor, "wb") as key_file:
            key_file.write(Fernet.generate_key())
    return Fernet(path.read_bytes())


def get_delivery_settings(connection, admin_id):
    return connection.execute(
        "SELECT from_name, from_email, token_encrypted FROM admin_email_settings WHERE admin_id=%s",
        (admin_id,),
    ).fetchone()


@router.get("", response_model=EmailSettingsRecord)
def get_settings(admin: Admin, response: Response):
    with connect_database() as connection:
        settings = get_delivery_settings(connection, admin["id"])
    response.headers.update(PRIVATE_HEADERS)
    return {"from_name": settings["from_name"], "from_email": settings["from_email"], "token_configured": True} if settings else {}


@router.put("", response_model=EmailSettingsRecord)
def save_settings(payload: EmailSettingsInput, admin: Admin, response: Response):
    encrypted = None
    if payload.send_mail_token is not None:
        try:
            encrypted = token_cipher().encrypt(payload.send_mail_token.get_secret_value().encode()).decode()
        except (OSError, ValueError, UnicodeError):
            raise HTTPException(503, "Email settings encryption is unavailable.", headers=PRIVATE_HEADERS) from None
    with connect_database() as connection:
        existing = get_delivery_settings(connection, admin["id"])
        if encrypted is None and existing is None:
            raise HTTPException(422, "A send-mail token is required for initial setup.", headers=PRIVATE_HEADERS)
        connection.execute(
            """INSERT INTO admin_email_settings (admin_id, from_name, from_email, token_encrypted)
            VALUES (%s, %s, %s, %s) ON CONFLICT (admin_id) DO UPDATE SET
            from_name=EXCLUDED.from_name, from_email=EXCLUDED.from_email,
            token_encrypted=COALESCE(%s, admin_email_settings.token_encrypted), updated_at=clock_timestamp()""",
            (admin["id"], payload.from_name, str(payload.from_email).lower(), encrypted or existing["token_encrypted"], encrypted),
        )
    response.headers.update(PRIVATE_HEADERS)
    return {"from_name": payload.from_name, "from_email": str(payload.from_email).lower(), "token_configured": True}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def send_account_email(settings, name, email, password, account_type) -> DeliveryStatus:
    return send_message(settings, name, email, f"Your Applied AI {account_type} account",
                        f"Hello {name},\n\nYour Applied AI {account_type} account has been created.\n\nEmail: {email}\nPassword: {password}\n\nKeep these credentials private. Contact your administrator if you need your password changed.\n\n{settings['from_name']}" if settings else "")


def send_invitation_email(settings, name, email, setup_url) -> DeliveryStatus:
    text = f"Hello {name},\n\nSet your Applied AI password using this link:\n{setup_url}\n\nThis single-use link expires in 24 hours. If you did not expect this invitation, ignore this email."
    html = f'<div style="font-family:Arial,sans-serif;color:#171717;line-height:1.6"><h2>Welcome to Applied AI</h2><p>Hello {escape(name)},</p><p>Your student account is ready. Choose your password to activate it.</p><p><a href="{escape(setup_url, quote=True)}" style="display:inline-block;background:#15803d;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none">Set up password</a></p><p>This single-use link expires in 24 hours.</p><p>If you did not expect this invitation, ignore this email.</p></div>'
    return send_message(settings, name, email, "Set up your Applied AI password", text, html)


def send_message(settings, name, email, subject, textbody, htmlbody=None) -> DeliveryStatus:
    if settings is None:
        return "not_configured"
    try:
        token = token_cipher().decrypt(settings["token_encrypted"].encode()).decode()
        endpoint = os.environ.get("ZEPTOMAIL_API_URL", "https://cpaas.zoho.in/v1.1/email")
        parsed = urlsplit(endpoint)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
            return "failed"
        body = {
            "from": {"address": settings["from_email"], "name": settings["from_name"]},
            "to": [{"email_address": {"address": email, "name": name}}],
            "subject": subject,
            "textbody": textbody,
            "track_clicks": False,
            "track_opens": False,
        }
        if htmlbody:
            body["htmlbody"] = htmlbody
        request = Request(endpoint, data=json.dumps(body).encode(), method="POST", headers={
            "Authorization": f"Zoho-enczapikey {token}", "Content-Type": "application/json", "Accept": "application/json",
        })
        with build_opener(NoRedirect()).open(request, timeout=8) as result:
            content = json.loads(result.read(65536))
            accepted = 200 <= result.status < 300 and any(item.get("code") == "EM_104" for item in content.get("data", []) if isinstance(item, dict))
        return "accepted" if accepted else "failed"
    except (HTTPClientError, HTTPError, URLError, OSError, ValueError, InvalidToken, TypeError, AttributeError):
        return "failed"