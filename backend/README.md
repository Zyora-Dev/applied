# Applied AI Backend

## Database Setup

The project uses the existing workspace environment at `../../.venv` from this directory.
The ignored `.env` contains `DATABASE_URL`; `.env.example` documents its format.
The default `postgresql:///applied-ai` uses a local Unix socket and the operating-system
username. For a different PostgreSQL server or role, configure the connection locally
in `.env`; URL-encode special characters in credentials. Do not share or commit secrets.

From the backend directory:

```sh
../../.venv/bin/python manage.py init
../../.venv/bin/python manage.py create-admin
```

`init` needs permission to create the database through the `postgres` maintenance
database and create its tables. It preserves an existing database and admin records.
Fill `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run `create-admin`.
Use a password of at least 12 characters. Quote values containing spaces or `#`;
dotenv variable interpolation is disabled so `${...}` remains literal.
The command stores only a salted Argon2id hash. Clear `ADMIN_PASSWORD` from `.env`
after successful creation; it is not needed for login. Never commit this file.
Existing shell environment variables take precedence over `.env` values.
If both admin variables are blank, the command prompts privately instead.
Partial credentials are rejected. Duplicate emails never overwrite credentials.

From the workspace root (`/Users/redfoxhotels/arunachala`), use:

```sh
.venv/bin/python 'applied ai /backend/manage.py' create-admin
```

The `.env` is resolved relative to the backend files, not the terminal directory.

The `admins` table stores `id`, lowercase unique `email`, `password_hash` and `created_at`.
Provisioning permissions are for local setup; a production runtime role should not
have database-creation rights.

## Admin Authentication

Run `../../.venv/bin/python manage.py init` after upgrading an existing database.
It also creates `admin_sessions` and `admin_login_limits` without changing admin records.

| Method | Route | Access |
| --- | --- | --- |
| POST | `/admin/login` | Email/password; returns a bearer access token |
| GET | `/admin/me` | Valid admin bearer token; returns only id and email |
| POST | `/admin/logout` | Valid admin bearer token; revokes that session, returns 204 |
| GET | `/health` | Public health check |

Login accepts JSON with `email` and `password`. The response contains `access_token`,
`token_type: "bearer"`, `expires_in: 28800` and `admin` (id/email). Send subsequent
requests with `Authorization: Bearer <access_token>`. In `/docs`, run login, then
use **Authorize** with the returned token to test the protected endpoints.

Passwords are verified against the database Argon2id hash, not `.env`. Random
256-bit session tokens expire after eight hours; PostgreSQL stores only their
SHA-256 hashes. Logout revokes the current token immediately; other sessions stay
active. Missing, invalid, expired, revoked and deleted-admin sessions return 401.
Login failures use a generic response and a dummy password hash for unknown users.
Successful authentication responses and 401 responses use `Cache-Control: no-store`.
Login permits ten attempts per client IP per one-minute window, stored atomically
in PostgreSQL; additional attempts return 429 with `Retry-After: 60`.

Register future private admin endpoints on `auth.admin_router`, which applies
`require_admin` to every route. A route on the main app or another router is not
automatically protected by its URL prefix. For another router, use
`dependencies=[Depends(require_admin)]`. Login, health and API documentation remain public.

This is local development authentication, not a production deployment. Use HTTPS
outside localhost, keep bearer tokens out of URLs/logs and persistent browser
storage, and configure trusted reverse-proxy addresses explicitly before using
forwarded client IPs for rate limiting. Clients sharing an IP share the login limit.
The sibling frontend uses these endpoints. No refresh-token flow or admin password reset/change endpoint is included.

## Students

`manage.py init` also creates the students table and index without replacing existing data.
Every student endpoint requires a valid admin bearer token and scopes records to that admin.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/admin/students` | Paginated records and filtered total |
| POST | `/admin/students` | Create a student; returns 201 |
| PUT | `/admin/students/{record_id}` | Update an owned student; returns 404 for missing/unowned records |
| GET | `/admin/students/summary` | Actual enrollment total, degree totals and stream counts |

Required fields: `name`, `student_id`, `email`, `mobile`, `college`, `degree`, `stream`.
Creation also requires `password` (12-1024 characters). On update, omit `password` or
send null to preserve the current hash; a supplied password replaces it. An empty string
is invalid. Password whitespace is preserved exactly. Only salted Argon2 hashes are
stored; passwords and hashes are never returned. Responses include `password_set`.
Initialization adds a nullable password column for legacy students without inventing
or resetting passwords. Existing students with no password remain unset until updated.
College must be `Arunachala Hitech Engineering College`; degree is `B.E` or `B.Tech`;
stream is `AI&DS`, `ECE`, `CSE`, `EEE`, `Mech`, `Civil` or `Others`.
Optional `github_url` and `linkedin_url` accept HTTPS profile links on the corresponding domain.
Student IDs are normalized to uppercase and emails to lowercase. Both are unique per admin;
duplicates return 409 and invalid fields return 422. No student records are seeded.

List queries accept `search` (name/ID/email), `page` (default 1), `page_size` (default 10,
maximum 100), `date_from` and `date_to` (inclusive added dates in Asia/Kolkata).
The response includes `items`, `total`, `page` and `page_size`. Summary ignores list filters.

## Weekly Progress

Run `manage.py init` after updating to add `student_week_progress` without replacing
accounts. Restart the backend to load the new routes.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/admin/students/{record_id}/progress` | Read an owned student's four weeks |
| PUT | `/admin/students/{record_id}/progress/{week}` | Save one owned student's week status |
| GET | `/student/progress` | Read the signed-in student's own four weeks |

Updates accept `{"status":"not_started"}`, `in_progress` or `completed`; week is 1-4.
Responses contain `weeks`, each with `week`, `status` and nullable `updated_at`.
Unset weeks return `not_started`. Admin routes enforce ownership; student progress
has no mutation endpoint. Progress writes do not modify the student account's
`updated_at`, so they do not invalidate existing student sessions.

## Faculty

`manage.py init` also creates the faculty table and index non-destructively. All routes
require an admin bearer token and scope records to that admin.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/admin/faculty` | Paginated faculty records and filtered total |
| POST | `/admin/faculty` | Create a faculty account; returns 201 |
| PUT | `/admin/faculty/{record_id}` | Edit name, role, email, password or active status |

Create requires `name`, `role`, `email` and `password`; `is_active` defaults to true.
Name is trimmed and must contain 1-150 characters. Role must be `HOD`, `Professor`,
`Asst. Professor`, `Principal` or `Director`. Update requires name, role and
email, accepts `is_active`, and accepts an optional replacement password. Omitted/null
password preserves the current hash. The same 12-1024 character and Argon2 rules apply.
Emails are normalized to lowercase and unique per admin. Duplicate emails return 409;
missing/unowned records return 404. Responses contain id, name, role, email, is_active and timestamps,
never credentials. Validation errors omit submitted input to avoid password disclosure.
Initialization adds nullable name/role columns for existing accounts; those fields remain
null until edited, without assigning fabricated details or changing passwords.

Listing accepts `search` (name/email/role), `page`, `page_size`, `date_from` and `date_to` using
the same pagination and inclusive IST dates as students. No data is seeded or deleted.
Active/inactive is a management field. Faculty sign-in/session flows are not implemented.

## Student Authentication and Self-Registration

`manage.py init` adds `student_sessions` and `student_auth_limits` without replacing
existing accounts. The frontend exposes student access at `/student/login` and
`/student/register`, with a private own-profile page at `/student`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/student/register` | Public registration using StudentCreate fields; returns 201 and a student session |
| POST | `/student/login` | Email/password login for admin-created and self-registered students |
| GET | `/student/me` | Current student's own profile; requires a student bearer token |
| POST | `/student/logout` | Revoke the current student session; returns 204 |

Registration requires the same name, student ID, email, mobile, college, degree, stream
and 12-1024 character password as admin creation; profile links remain optional.
Passwords are hashed with Argon2 and never returned. Duplicate email/student ID within
the enrollment owner returns 409, never overwriting or claiming an existing account.
Students with no stored password must contact their administrator to set one.

With exactly one admin, that admin owns registrations and the student login namespace.
With multiple admins, set server-only `STUDENT_REGISTRATION_ADMIN_ID` to the intended
admin ID. It must identify an existing admin. Missing/ambiguous ownership fails closed
with 503; the browser cannot choose an owner. Registrations appear in the owner's
existing student management list.

Login and registration return `access_token`, `token_type`, `expires_in: 28800` and
`student`. Student tokens use a separate table from admin tokens; only SHA-256 hashes
are stored. Sessions last eight hours and become invalid on any admin edit to the student.
Deleting a student cascades their sessions. Student tokens cannot access admin APIs.

Login permits ten attempts and registration five attempts per client IP per minute.
As with admin auth, the current Next.js proxy shares its IP across users; production
proxy-aware throttling remains pending. Registration is immediate: email verification,
approval, password recovery and student self-editing are not included. No student access
automated/browser tests were run for this change; manual testing is delegated to the user.

## Authentication Tests

From this directory:

```sh
../../.venv/bin/python -m unittest -v test_auth
```

These tests exercise FastAPI and PostgreSQL using disposable schemas within
rollback-only transactions. They require a reachable database and permission to
create schemas. Existing accounts and sessions are not modified. Coverage includes
login, token hashing, protected identity, credential failures, malformed/missing
tokens, expiry, deletion, session-specific logout and login throttling/reset.
Student coverage includes empty totals, create/read/update persistence, optional links,
validation, duplicates, pagination/search/date filters and cross-admin isolation.
The eight-test suite also covers student/faculty password hashing, exact whitespace,
replacement and preservation, sanitized validation errors, faculty status changes,
email normalization, duplicates, filtering/pagination and cross-admin isolation.

## Run Locally

```sh
../../.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8900
```

The workspace task `Applied AI: Backend (8900)` also starts the API.