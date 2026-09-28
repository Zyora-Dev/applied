# Applied AI Console Frontend

Next.js App Router, TypeScript, Tailwind CSS and shadcn/ui. Dark charcoal theme, maroon accents and locally bundled Inter.

## Local Development

From this directory:

```sh
npm install
npm run dev
```

Open http://localhost:3300. The workspace task `Applied AI: Frontend (3300)` runs the same server. FastAPI must be running at http://127.0.0.1:8900 for authentication.

The server-only `API_BASE_URL` defaults to that backend address. An optional `.env.local` can override it using [.env.example](.env.example). Never place credentials or session tokens in public environment variables.

## Authentication

- `/` and `/admin/login` show the login page. Authenticated users redirect to `/admin`.
- `/admin` verifies the session with FastAPI before displaying the dashboard. Its responsive sidebar switches between Overview, Students, Faculty and Admin account views; sign-out remains available in the sidebar. Overview shows only database-backed student totals and stream counts, never the planned cohort size.
- Same-origin `/api/admin/login` and `/api/admin/logout` handlers forward requests to FastAPI. Browser requests do not need backend CORS configuration.
- The backend bearer token is stored only in an HTTP-only, SameSite=Lax cookie with an eight-hour lifetime. It is not returned in browser JSON or stored in local storage.
- Logout revokes the backend session before clearing the cookie. If the backend cannot be reached, logout reports a retryable error.
- POST and PUT requests require a matching Origin header. Production cookies require HTTPS. Trusted reverse proxy/origin handling must be configured and tested before deployment.
- FastAPI currently sees the Next.js server IP, so its login limit is shared across proxied users, not independently applied per browser IP. Production rate-limit/proxy design remains pending.

Use the administrator already provisioned through the backend. This frontend does not create or reset administrator accounts.

## Students

The Students menu lists actual records, with add/edit dialogs, search, added-date filters
(IST), ten-record pagination, a desktop table and mobile records. All requested contact
and academic details are included; GitHub and LinkedIn links are optional. College is
fixed to Arunachala Hitech Engineering College. No student data is seeded or mocked.

New students require a password of 12-1024 characters. Edit shows an empty replacement
field; leaving it blank keeps the stored password. Legacy students without a password
are prompted to set one when editing. Passwords can be revealed while entering them,
but stored passwords are never returned or displayed. The backend stores Argon2 hashes.

The `/api/admin/students` proxy forwards only supported routes and filters through the
server-held session token. Loading, empty, validation, duplicate, network and expired-session
states are handled. Initialize the updated backend with `manage.py init` before using it.

## Faculty

The Faculty menu provides name, role, email/password creation, detail edits, optional password
replacement and an Active account checkbox. Name and role are required on create/edit;
roles are HOD, Professor, Asst. Professor, Principal and Director. Existing records without
these details display unset values until edited. It includes responsive table/mobile records,
search, inclusive IST added-date filters, ten-record pagination and loading/error/empty
states. Blank replacement passwords preserve existing credentials. All data is real and
admin-owned. The shared proxy applies identical cookie, Origin and validation protections
to `/api/admin/faculty` and `/api/admin/students`.
Names and roles appear on desktop/mobile records; search matches name, email or role.

Faculty active status is stored for management; faculty authentication is not implemented.

## Student Access

- `/student/login` signs in students with their existing email/password and links to registration.
- `/student/register` offers self-registration using the existing contact/academic fields,
	a password and confirmation, and optional GitHub/LinkedIn links. College remains fixed.
- Successful login or registration opens `/student`, a server-protected own-profile page
	with sign-out. No other students or admin controls are exposed there.
- Admin login now links to student sign-in/registration. Admin routes and the root page remain unchanged.
- `/api/student/login`, `/api/student/register`, `/api/student/me` and `/api/student/logout`
	proxy to the backend. The separate `applied_ai_student` cookie is HttpOnly, SameSite=Lax,
	eight hours, and Secure in production; bearer tokens never appear in browser JSON/storage.
- Mutations enforce Origin. Invalid fields, duplicates, throttling, unavailable services
	and expired sessions have error handling. Registration checks matching passwords.
- Self-registered students appear in the enrollment owner's existing admin list. Backend
	initialization and enrollment ownership configuration are described in its README.
- Registration is immediate; there is no email verification or password recovery yet.

Student access editor diagnostics are clear. Local additive database initialization and
backend restart completed. No automated tests, browser tests, build or sample registration
were performed for this update; the user will test manually.

## Student Dashboard

`/student` uses pure black surfaces and lime green (#bef264) accents with official
shadcn Sidebar/Sheet, Breadcrumb, Card, Tabs and Button components. Student styling
is scoped separately; admin and login screens are unchanged. Lime fills use dark text.

Overview contains one student card composed with shadcn CardHeader, CardTitle,
CardDescription, CardAction, Avatar and CardFooter: name, student ID and View profile.
The original programme card remains below, including its banner, duration badge,
subtitle, session facts, topic badges and View course footer. Exactly four week cards
follow with roadmap-based titles, descriptions, topics, deliverables and saved status.
Clicking a card opens outcomes, both sessions, practice tasks and materials, with
back/previous/next navigation. The two-column week grid stacks on mobile.
There is no side account column or duplicated student identity in
the sidebar/header.

View profile opens the full read-only academic/contact profile and professional links.
Sidebar navigation retains Overview, My course, My profile and student sign-out.
The mobile Sheet closes on navigation or Escape. Skip-link and content-focus handling
remain available. The server still verifies the session before passing the student's
own profile to the client. No progress, scores, attendance or assignments are invented.

Students see their own persisted Not started / In progress / Completed status and
completed-week count. Progress refreshes on window focus and every 30 seconds while
visible; failures display unavailable status with retry. Materials are listed by
name only; downloadable files have not been published.

Administrators use the book icon beside a student in Students to open Weekly progress.
Each week has its own status selector and save button. The separate progress endpoint
preserves student account timestamps and active student sessions. Run the backend's
additive initializer and restart it when upgrading. No student-side status editing.

Weekly progress update: editor diagnostics and backend syntax checks passed; local
initialization and API restart completed. Authenticated saving, student refresh and
responsive visuals remain for manual review. No build or browser tests were run.

Editor diagnostics are clear. No build or browser tests were run for this refinement;
visual and interaction review remains with the user.

## Validation

```sh
npx tsc --noEmit
npm run lint
```

Both passed. Development rendering inspected at 1440x960 and 390x844 with no horizontal overflow; password visibility and mocked invalid-login recovery verified. Live HTTP checks verified missing/invalid-session redirects, cross-origin POST rejection, request validation and stale-session logout cleanup.

Successful real-account login and authenticated logout have not been exercised through the frontend. No real password was read or changed. A production build has not been run pending visual approval; no deployment performed.

Dashboard update: TypeScript and focused ESLint checks passed; unauthenticated `/admin` redirect rechecked. Dashboard screenshot and interaction checks require an authenticated session and remain pending.
Students update: TypeScript, focused ESLint and editor checks passed; live student proxy
401/no-store and mutation Origin403 checks passed. Authenticated student form/table visual
and browser interaction verification remains pending, as does the production build.
Password/faculty update: TypeScript, focused ESLint and editor checks pass. Live API
schema, faculty/student proxy authentication/no-store, POST/PUT Origin checks and
unsupported-route rejection pass. Local migration and backend restart completed;
authenticated form/visibility/status interactions and responsive visuals remain pending
because the shared browser is signed out. No production build or deployment performed.
