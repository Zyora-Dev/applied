CREATE TABLE programme_weeks (
    admin_id BIGINT NOT NULL REFERENCES admins(id),
    week SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 4),
    is_open BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (admin_id, week)
);