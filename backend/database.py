import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"), interpolate=False)


def database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise ValueError("Set DATABASE_URL in backend/.env before continuing.")
    return value


def connect_database() -> psycopg.Connection:
    return psycopg.connect(database_url(), connect_timeout=5)