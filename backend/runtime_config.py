import os
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from psycopg.conninfo import conninfo_to_dict


def validate_runtime_config():
    environment = os.environ.get("APP_ENV", "local")
    if os.environ.get("RENDER") and environment == "local":
        raise ValueError("APP_ENV must be explicitly nonlocal on Render.")
    if environment == "local":
        return
    required = (
        "DATABASE_URL", "STUDENT_APP_ORIGIN", "EMAIL_SETTINGS_KEY",
        "GOOGLE_DRIVE_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI", "GOOGLE_PICKER_API_KEY", "GOOGLE_PROJECT_NUMBER",
    )
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        raise ValueError("Missing production configuration: " + ", ".join(missing))
    origin = os.environ["STUDENT_APP_ORIGIN"]
    try:
        parsed = urlsplit(origin)
        valid_origin = (
            parsed.scheme == "https" and parsed.hostname and not parsed.username
            and not parsed.password and not parsed.path and not parsed.query
            and not parsed.fragment and parsed.port in (None, 443)
            and origin == "https://" + parsed.netloc
            and not any(character.isspace() for character in origin)
        )
    except ValueError:
        valid_origin = False
    if not valid_origin:
        raise ValueError("STUDENT_APP_ORIGIN must be an HTTPS origin without a trailing slash or path.")
    if os.environ["GOOGLE_REDIRECT_URI"] != origin + "/api/student/google-drive/callback":
        raise ValueError("GOOGLE_REDIRECT_URI must match STUDENT_APP_ORIGIN and the Google Drive callback path.")
    for name in ("EMAIL_SETTINGS_KEY", "GOOGLE_DRIVE_ENCRYPTION_KEY"):
        try:
            Fernet(os.environ[name].encode("ascii"))
        except (ValueError, UnicodeError):
            raise ValueError(name + " must be a valid persistent Fernet key.") from None
    project_number = os.environ["GOOGLE_PROJECT_NUMBER"]
    if not project_number.isascii() or not project_number.isdigit():
        raise ValueError("GOOGLE_PROJECT_NUMBER must contain ASCII digits only.")
    try:
        database = conninfo_to_dict(os.environ["DATABASE_URL"])
        valid_database = bool(database.get("host") and database.get("dbname"))
    except Exception:
        valid_database = False
    if not valid_database:
        raise ValueError("DATABASE_URL must specify a PostgreSQL host and database.")