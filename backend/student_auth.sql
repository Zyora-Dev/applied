CREATE TABLE IF NOT EXISTS student_sessions (
    token_hash TEXT PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_updated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS student_sessions_student_id ON student_sessions (student_id);
CREATE INDEX IF NOT EXISTS student_sessions_expires_at ON student_sessions (expires_at);