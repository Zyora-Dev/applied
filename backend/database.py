import os

import psycopg
from psycopg.rows import dict_row


def connect_database():
    return psycopg.connect(
        os.environ.get("DATABASE_URL", "host=localhost dbname=applied-ai"),
        connect_timeout=5,
        row_factory=dict_row,
    )