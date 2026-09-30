ALTER TABLE faculty ADD COLUMN IF NOT EXISTS admin_id BIGINT REFERENCES admins(id);

CREATE INDEX IF NOT EXISTS faculty_owner_created_idx
ON faculty (admin_id, created_at DESC, id DESC)
WHERE deleted_at IS NULL;