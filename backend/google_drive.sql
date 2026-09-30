CREATE TABLE student_google_drive (
    student_id BIGINT PRIMARY KEY REFERENCES students(id),
    refresh_token_encrypted TEXT,
    connected_at TIMESTAMPTZ,
    state_hash TEXT,
    session_hash TEXT,
    verifier_encrypted TEXT,
    expires_at TIMESTAMPTZ
);