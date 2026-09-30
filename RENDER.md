# Render Deployment

The repository-root `render.yaml` defines a public Next.js frontend, private
FastAPI backend and private PostgreSQL database in Singapore. Deployment is a
separate, explicitly approved action. Publish the complete source, including
`backend/manage.py`, `backend/runtime_config.py` and all eleven SQL migrations,
before applying this Blueprint. Automatic deploys are disabled.

## Configuration

Choose the actual public HTTPS frontend origin first. Use exactly the same origin
for frontend `APP_ORIGIN` and backend `STUDENT_APP_ORIGIN`, without a trailing slash,
path, query or fragment. `RENDER_EXTERNAL_URL` is not a configuration fallback.
Neither localhost defaults nor arbitrary forwarded headers establish production trust.

| Service | Variable | Required value |
| --- | --- | --- |
| Frontend | `APP_ORIGIN` | Verified public HTTPS origin |
| Frontend | `NODE_ENV` | `production`, supplied by Blueprint |
| Frontend | `BACKEND_HOSTPORT` | Generated private backend address, supplied by Blueprint |
| Frontend | `API_BASE_URL` | Set by the start command from `BACKEND_HOSTPORT`; server-only |
| Backend | `APP_ENV` | `production`, supplied by Blueprint |
| Backend | `DATABASE_URL` | Private database connection string, supplied by Blueprint |
| Backend | `STUDENT_APP_ORIGIN` | Same public origin as frontend `APP_ORIGIN` |
| Backend | `EMAIL_SETTINGS_KEY` | Stable Fernet key for saved ZeptoMail credentials |
| Backend | `GOOGLE_DRIVE_ENCRYPTION_KEY` | Stable Fernet key for saved Google refresh tokens |
| Backend | `GOOGLE_CLIENT_ID` | Google web OAuth client ID |
| Backend | `GOOGLE_CLIENT_SECRET` | Corresponding OAuth client secret |
| Backend | `GOOGLE_REDIRECT_URI` | Public origin followed by `/api/student/google-drive/callback` |
| Backend | `GOOGLE_PICKER_API_KEY` | Google Picker browser key restricted to the public site and required API |
| Backend | `GOOGLE_PROJECT_NUMBER` | Numeric Google Cloud project number, not project ID |

`sync: false` entries prompt only during initial Blueprint creation. **When updating
an existing Blueprint, Render ignores those entries:** add or verify every value
manually in each service's environment before deploying. Keep secrets out of Git,
chat, screenshots and command arguments.

Backend startup and management commands reject incomplete nonlocal configuration.
Frontend production startup rejects missing or malformed `APP_ORIGIN` and
`API_BASE_URL`; development and build phases do not require runtime secrets.
These checks validate configuration syntax, not Google authorization, mail delivery
or database connectivity. Never set `APP_ENV=local` to bypass production checks.

For a fresh database only, generate two independent Fernet keys privately and store
them in a secret manager and the backend environment. For an existing database,
preserve its original keys. Local fallback keys, if used, live in backend
`.secrets/zeptomail.key` and `.secrets/google-drive.key`; migrate their values securely
with the database. Replacing a key makes existing encrypted credentials unreadable.
The production filesystem must not be the only copy of either key.

Configure Google Drive API, Google Picker API and the OAuth consent screen in the
same project. Register the exact callback URI and public JavaScript origin. Confirm
the intended student accounts can authorize the `drive.file` scope, including any
consent-screen testing restrictions or publishing requirements. Recheck browser-key
restrictions on the actual hosted origin. The portal uses Google's official Picker;
Drive connection does not grant access to every file automatically.

Configure the verified ZeptoMail sender and token through Admin > Email settings.
A successful provider response means accepted for sending, not inbox delivery.
Test actual receipt separately before sending invitations to the class.

## Database And Admin

The backend pre-deploy command is:

```sh
python manage.py init-schema
```

It applies the ordered SQL migrations inside a transaction and records SHA-256
checksums in `schema_migrations`. Repeat runs skip applied migrations. Changed
checksums, gaps and unknown migration names stop deployment. Do not edit applied
SQL files; future changes need a new migration appended to `MIGRATIONS`.

An existing database without this ledger is deliberately refused. Take and verify
a backup first, preserve both encryption keys, and inspect the target connection.
From a private backend environment with the new source and correct target settings,
run this once:

```sh
python manage.py baseline-schema
python manage.py init-schema
```

Baseline compares the existing schema against all current migrations in a temporary
reference schema. It records checksums only if they match, without replaying SQL
against application tables. This requires schema-creation permission. A partial or
different schema is refused; stop and review an explicit additive migration. Never
drop/recreate the database, force a ledger entry or reset accounts to bypass refusal.
Do not run baseline on a fresh database. Management commands use the supplied
environment and do not automatically load a local `.env` file.

After successful initialization, an operator can create the initial administrator
from the backend's private Render Shell:

```sh
python manage.py create-admin --email '<administrator-email>'
```

Replace the placeholder with the intended email. Enter and confirm the password
directly in the hidden prompts. Existing accounts are not overwritten or reset.
No accounts, local records or credentials are copied to Render automatically.

Administrators create students and faculty. There is no public self-registration.
Inactive students can receive invitation links and set their own passwords.
Student and faculty sessions are separate from admin sessions; account updates,
deactivation, archiving, password changes and logout invalidate relevant sessions.

## Programme And Reviews

Administrators control access to each of four weeks. Week 1's Friday material has
an additional server-side release gate; unlocking the week does not bypass it.
Weeks 2-4 lesson content is intentionally unpublished. Prepare those materials
before their teaching dates; deployment does not generate missing lessons.

Students connect Drive, select a `.ipynb` file and submit practical or homework
separately. The portal stores an immutable snapshot, receipt, SHA-256 and IST
timestamp. Editing Drive later does not change a saved attempt. History supports
date filters, pagination and private downloads. Retry IDs prevent duplicate saves.
Limits are 2 MiB per notebook and 20 attempts per student/week/work type.

Faculty sign in at `/faculty/login` and can monitor only their administrator's
students. They inspect practical/homework histories and download notebooks, then
save integer grades from 0 to 100 with required feedback. Reviews are append-only;
stale concurrent edits are rejected. Students see the latest review. Faculty may
review saved work after a week is locked. The portal never executes notebook code.

## Capacity And Recovery

The local Blueprint proposes paid 0.5 CPU / 512 MB frontend and backend services,
and a 0.1 CPU / 256 MB PostgreSQL instance with **35 GB storage**. Review the quoted
cost and approve it before applying; nothing has been provisioned by this change.
External database access remains disabled. Render accepts 1 GB or multiples of
5 GB and permits increases, not decreases. Preserve a larger existing allocation.

At the configured limits, 60 students can store up to 18.75 GiB of raw notebook
content: 60 x 4 weeks x 2 work types x 20 attempts x 2 MiB. The 35 GB proposal adds
headroom, but is not a capacity guarantee; PostgreSQL overhead, WAL, reviews and
future cohorts require monitoring. Configure storage alerts and review retention
before filling the database. Do not delete immutable submissions to recover space
without an approved retention policy and backup.

The shared Next.js upstream IP is limited to 300 login attempts per minute per
role; each email remains limited to 10 per minute. This avoids the previous
10-request class-wide bottleneck without trusting client-supplied forwarded IPs.
It is not a throughput guarantee. Load-test realistic concurrent logins, history,
downloads and submissions against the chosen compute plans before launch.

Confirm the database plan's backup/PITR retention and take a recovery snapshot
before migrations. Restore a backup into a separate private database and verify
accounts, notebook hashes, review history and encrypted settings using the original
keys. Keep an approved previous release and environment backup. Rolling code back
does not automatically roll the schema back; review compatibility before rollback.

## Launch Checks

1. Confirm all required source files are published, environment values agree, and
  the storage/compute quote is approved. Deploy backend before frontend.
2. Verify migration completion, backend startup logs and frontend health. The
  `/student/login` health check alone does not prove backend/database health.
3. With approved test accounts, check admin CRUD, filters, password changes,
  archive/deactivation, email settings, invitation delivery and password setup.
4. Check student login/profile/password/logout and locked-week direct-link denial.
  Unlock a test week and connect Google on the actual public origin.
5. Submit both practical and homework, retry an uncertain save, reload history,
  filter dates, paginate and compare downloaded bytes to the saved receipt hash.
6. Sign in as the matching faculty member, grade both types, check review history
  and stale-review rejection, then verify the latest feedback as the student.
7. Verify cross-administrator and cross-role denial, expired/revoked sessions,
  foreign-origin mutation rejection and Secure/HttpOnly/SameSite cookies over HTTPS.
8. Complete realistic concurrent-load and separate-database restore checks. Confirm
  alerts, recovery ownership and the teaching-content schedule.

Local tests mock external providers and isolate database writes in rolled-back
schemas. Passing them is not proof of hosted OAuth, inbox delivery, production
capacity or recoverability. Those acceptance checks remain required before launch.