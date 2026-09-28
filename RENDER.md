# Render Deployment

Use the repository-root `render.yaml` as a Blueprint for `Zyora-Dev/applied`, branch `main`.

## Defaults

- Singapore region for all three resources.
- Next.js public web service: 0.5 CPU / 512 MB, paid.
- FastAPI private service: 0.5 CPU / 512 MB, paid.
- PostgreSQL: 0.1 CPU / 256 MB, 1 GB storage, paid; external access disabled.
- Review Render's quoted cost before applying. Edit plans/region in the Blueprint if needed.
- Automatic deploys are disabled. Trigger subsequent deployments manually.

The frontend uses the backend's generated private host/port; the database connection
is injected by Render. No credentials or fixed public URLs belong in this file.
Only the frontend needs a public URL or custom domain. The backend is not public.

The frontend's same-origin check uses Render's automatic `RENDER_EXTERNAL_URL`,
not the proxy-internal request URL. For a custom domain, set frontend `APP_ORIGIN`
to its full public origin (for example, `https://training.example.com`); this
overrides the Render hostname. No forwarded headers are trusted for this check.
Without either variable, local development compares against the request origin.

## Database And Admin

The backend pre-deploy command runs `python manage.py init-schema` against the
database already created by Render. It creates missing tables and applies existing
additive schema updates without creating another database or replacing records.
Local `manage.py init` behavior is preserved.

After the backend deploys, open its Render Shell and run:

```sh
python manage.py create-admin
```

Enter your admin email and password directly in that shell. The password prompt
is hidden. No account or credentials are created automatically. The local database
and local admin account are not copied to Render. Create the admin before opening
student registration. With one admin, registrations are assigned automatically;
with multiple admins, set backend `STUDENT_REGISTRATION_ADMIN_ID` explicitly.

## Launch Checks

- Confirm both services deploy successfully and the backend schema command succeeds.
- Check admin login/logout and student registration/login over the frontend HTTPS URL.
- Save a student's week status as admin and confirm it appears after student refresh.
- Confirm mutation requests are accepted on the actual HTTPS hostname; the app
  enforces same-origin requests and production cookies are Secure/HttpOnly.

Known limitation: authentication rate limits currently see the shared Next.js
backend connection IP. Simultaneous class-wide onboarding may receive HTTP 429.
This Blueprint does not change authentication or trust arbitrary forwarded headers;
trusted client identity handling remains a separate launch-readiness task.

Blueprint preparation is not a production-readiness certification. Production
build and authenticated hosted checks must pass before announcing availability.