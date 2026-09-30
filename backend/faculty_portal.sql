ALTER TABLE student_submissions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'homework'
    CHECK (kind IN ('practical', 'homework'));

CREATE INDEX IF NOT EXISTS student_submissions_kind_history
    ON student_submissions (student_id, week, kind, submitted_at DESC);

CREATE TABLE IF NOT EXISTS submission_reviews (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES student_submissions(id),
    faculty_id BIGINT NOT NULL REFERENCES faculty(id),
    score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
    feedback TEXT NOT NULL CHECK (length(feedback) BETWEEN 1 AND 10000),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS submission_reviews_latest ON submission_reviews (submission_id, reviewed_at DESC, id DESC);

CREATE TRIGGER submission_reviews_immutable BEFORE UPDATE OR DELETE ON submission_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_submission_changes();