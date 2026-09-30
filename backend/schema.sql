CREATE FUNCTION set_account_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.created_at = OLD.created_at;
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TABLE admins (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL CHECK (email = btrim(email) AND email <> ''),
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX admins_email_unique ON admins (lower(email));

CREATE TRIGGER admins_updated_at
BEFORE UPDATE ON admins
FOR EACH ROW EXECUTE FUNCTION set_account_updated_at();

CREATE TABLE students (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    student_id TEXT NOT NULL UNIQUE
        CHECK (student_id = btrim(student_id) AND student_id <> ''),
    email TEXT NOT NULL CHECK (email = btrim(email) AND email <> ''),
    mobile TEXT NOT NULL CHECK (btrim(mobile) <> ''),
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    college TEXT NOT NULL CHECK (btrim(college) <> ''),
    degree TEXT NOT NULL CHECK (btrim(degree) <> ''),
    year SMALLINT NOT NULL CHECK (year > 0),
    github TEXT,
    linkedin TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX students_email_unique ON students (lower(email));

CREATE TRIGGER students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION set_account_updated_at();

CREATE TABLE faculty (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    role TEXT NOT NULL CHECK (btrim(role) <> ''),
    email TEXT NOT NULL CHECK (email = btrim(email) AND email <> ''),
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX faculty_email_unique ON faculty (lower(email));

CREATE TRIGGER faculty_updated_at
BEFORE UPDATE ON faculty
FOR EACH ROW EXECUTE FUNCTION set_account_updated_at();