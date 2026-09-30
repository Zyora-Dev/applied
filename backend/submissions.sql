CREATE TABLE student_submissions (
    id UUID PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(id),
    week SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 4),
    request_id UUID NOT NULL,
    drive_file_id TEXT NOT NULL CHECK (length(drive_file_id) BETWEEN 1 AND 256),
    filename TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 1024),
    notebook BYTEA NOT NULL CHECK (octet_length(notebook) BETWEEN 1 AND 2097152),
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (student_id, week, request_id)
);

CREATE INDEX student_submissions_history ON student_submissions (student_id, week, submitted_at DESC);

CREATE FUNCTION prevent_submission_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Submission snapshots are immutable';
END;
$$;

CREATE TRIGGER student_submissions_immutable
BEFORE UPDATE OR DELETE ON student_submissions
FOR EACH ROW EXECUTE FUNCTION prevent_submission_changes();