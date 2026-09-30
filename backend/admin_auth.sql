CREATE TABLE admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    admin_updated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX admin_sessions_admin_id ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE TABLE admin_login_limits (
    bucket_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL CHECK (attempts > 0),
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);