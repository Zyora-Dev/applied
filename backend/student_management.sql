ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_id BIGINT REFERENCES admins(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say'));
CREATE INDEX IF NOT EXISTS students_owner_created_idx ON students (admin_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS student_invitations (
    student_id BIGINT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    student_updated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);