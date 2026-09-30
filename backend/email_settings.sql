CREATE TABLE IF NOT EXISTS admin_email_settings (
    admin_id BIGINT PRIMARY KEY REFERENCES admins(id),
    from_name TEXT NOT NULL,
    from_email TEXT NOT NULL,
    token_encrypted TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);