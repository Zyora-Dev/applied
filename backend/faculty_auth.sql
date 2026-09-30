CREATE TABLE IF NOT EXISTS faculty_sessions (
    token_hash TEXT PRIMARY KEY,
    faculty_id BIGINT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    faculty_updated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS faculty_sessions_faculty_id ON faculty_sessions (faculty_id);
CREATE INDEX IF NOT EXISTS faculty_sessions_expires_at ON faculty_sessions (expires_at);