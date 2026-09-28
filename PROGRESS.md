# Applied AI Console Progress

Last updated: 2026-09-28

## Render Blueprint

- Added repository-root render.yaml for a public Next.js frontend, private FastAPI backend and private PostgreSQL. Defaults: Singapore, paid 0.5c-512mb services and 0.1c-256mb database with 1 GB storage. Automatic deploys disabled; user reviews plans/cost and deploys manually.
- Backend pre-deploy runs new manage.py init-schema against Render's existing database. Local init retained; no database creation permissions required by init-schema, no credentials/accounts seeded. Frontend private API URL is assembled at startup; Render injects the database URL. Added RENDER.md with one-time admin provisioning and launch checks.
- Validation: mocked schema CLI checks passed without touching a database; YAML parsing and service/database references, directories, ports, regions and privacy checks passed using existing js-yaml. Editor diagnostics clear. Initial YAML check used an unavailable parser, then corrected to the installed parser without adding dependencies.
- Blueprint publication: render.yaml, RENDER.md and the required backend schema-only command are included together at the repository root on main for Render discovery. No Render login, resource creation, deployment or production build performed. Shared proxy-IP authentication throttling and hosted authentication/progress checks remain outstanding; documented in RENDER.md. User explicitly handles Render deployment.

## Repository Setup

- Initialized this course directory as a Git repository on main, connected to https://github.com/Zyora-Dev/applied.git. Remote was empty before initialization. Repository root contains frontend/, backend/ and course materials.
- Added root ignore rules for environment secrets, dependencies, builds, caches, private keys and database files. Verified exclusions and scanned 77 staged files for common credential patterns; checks passed.
- Initial source commit cfbc558 pushed successfully to origin/main on 2026-09-28, with upstream tracking configured. Includes frontend, backend and training materials; local environment secrets, database data and generated dependencies/builds were not uploaded. Render deployment and production validation remain pending.

## Day 1 Training Slides

- Added Applied_AI_Training_Overview.html: 12 self-contained 16:9 landscape slides covering the four-week plan, learning, dataset validation, PyTorch, GPUs, evaluation, Transformers, Hugging Face, RAG, individual project and onboarding. Monday is overview/onboarding; practical PyTorch starts Friday.
- Offline HTML with original diagrams, canvas GPU illustration, previous/next and keyboard navigation, slide selector, fullscreen and landscape print styling. No server, external assets or dependencies required; no PDF generated. Dashboard, backend and original roadmap unchanged.
- Validation: editor diagnostics clear; Node structure/JavaScript checks and mock-DOM navigation, drawing, scaling and print-action checks passed. Browser visuals, fullscreen and actual printed pagination remain unverified; no build or browser tests run.

## Student Access

- Day 1 correction (Monday, 28 September 2026): shared console Week 1 content now opens with the four-week programme overview and student onboarding, not a dataset-validation lab. Updated card title/description/topics, outcomes, tasks, deliverables and materials; later PyTorch session retained. No automatic student completion or backend changes. Editor diagnostics clear; no build/browser tests. Original roadmap files and later-week scheduling have not been revised.
- Weekly details and progress implemented: all four cards now show topics, deliverables, session duration and saved status, with detailed outcomes, sessions, practice tasks and materials on click. Back/previous/next navigation and completion count added; original programme/profile cards retained. Content follows the roadmap with individual-project wording; downloadable materials are not yet published.
- Admin Students desktop/mobile book action opens a separate weekly-progress dialog. Each week saves Not started, In progress or Completed independently with loading/error/pending states. Students have read-only progress, refreshed on focus and every 30 seconds while visible.
- Added student_week_progress storage, owner-scoped admin GET/PUT and session-scoped student GET, with explicit proxy route allowlists. Progress updates do not change student account timestamps or invalidate student sessions. Existing records without progress default to Not started.
- Validation: changed-file editor diagnostics and backend Python syntax passed. Existing additive database initializer completed; backend restarted directly using the saved task command (PID 92371, port 8900), startup successful. Task runner could not resolve its label. No sample records, automated/browser tests, production build or deployment; authenticated persistence and responsive visuals await manual review.
- Student login/register now match dashboard black/lime #bef264: scoped AuthShell theme covers buttons, branding, links, focus and form backgrounds; self-registration degree/stream portaled dropdowns receive the same theme. Admin styles, authentication and layout unchanged. Editor diagnostics clear; no build/browser tests, manual visual review pending.
- Profile card greeting/date/time: added Good morning (before noon), Good afternoon (noon to 16:59), or Good evening with local device date and live 12-hour clock including seconds/timezone. Isolated header initializes after mount to avoid hydration mismatch; timer cleans up on unmount. Other dashboard content unchanged. Editor diagnostics clear; no build/browser tests, manual review pending.
- Profile-only refinement: student identity Card now has a solid lime background, dark readable name/ID/labels, dark initials avatar, subtle footer divider and black View profile button with dark focus ring. Only .student-identity-card styles changed; programme/week cards, sidebar/header and behavior untouched. Editor diagnostics clear; user visual review pending, no build/browser tests.
- Latest correction: restored the original programme Card (banner, duration badge, subtitle, session facts, topic badges and View course footer) above the four week cards. User did NOT authorize removing that programme card. Student accent is now lime #bef264 with dark text on lime, black backgrounds retained; replaces maroon across active navigation, buttons, avatars, course/week cards and tabs, including mobile Sidebar. Profile card now composes official shadcn CardHeader/CardTitle/CardDescription/CardAction/Avatar/CardFooter with name, ID and working View profile, without a side account panel. Editor diagnostics clear; no build/browser tests, visual approval pending. Supersedes the earlier minimal programme-text and maroon directions.
- Student dashboard simplified to the explicit minimal layout: one shadcn Card with student name, ID and View profile, then programme details and exactly four roadmap-based week cards with titles/short descriptions (two columns, stacking on mobile). Removed the side account column, sidebar identity/programme blocks, header identity and repeated welcome details. Full read-only profile remains behind View profile/My profile. Official shadcn Sidebar/Sheet, Breadcrumb, Card, Tabs and existing controls are in use. Dedicated student CSS uses black surfaces and deep maroon #500018, removing pink accents. Auth/backend/admin/login unchanged. Editor diagnostics clear; no build/browser tests, visual review remains with the user. Supersedes the prior dashboard layouts below.
- Student dashboard styling corrected to user requirement: pure black (#000) shell/sidebar/header and maroon (#800020) accents, no charcoal or summary gradient. Page titles 20px, section headings 14px, summary values 16px; narrower sidebar and balanced spacing. Navigation/profile actions use existing shadcn Button; mobile navigation uses shadcn Dialog with focus trapping, Escape and close control. Data/auth unchanged; admin/login unaffected. Editor diagnostics clear; no build/browser tests, user visual review pending. This supersedes the initial charcoal styling below.
- Fixed student dashboard build failure: installed lucide-react does not export Github or Linkedin. Replaced them with supported Link2/UserRound icons while preserving link labels and targets. Node check verified all 13 dashboard Lucide imports exist in the installed package; no full build or browser tests run.
- Student dashboard added at /student: dedicated spacious sidebar/header layout in the existing charcoal/maroon theme, Overview / Course overview / My profile navigation, student identity and sign-out, mobile disclosure menu with Escape handling, skip link and content focus on navigation. Overview shows real student ID/degree/stream, programme facts, contact details and professional links; profile includes all existing academic/contact fields. Course overview uses the documented topics and planned weekly format, without invented scores, completion, assignments or attendance. Server getStudent guard and backend unchanged. Editor diagnostics clear; no tests/browser checks/build run per user preference, visual approval pending.
- Removed the admin sign-in link from the student login page; registration link and admin login behavior unchanged. Editor diagnostics clear; no tests or build run.
- Implemented student self-registration/login/me/logout backend with separate hashed eight-hour sessions, rate limiting and existing student field validation. Registration creates an admin-owned student without overwriting existing accounts. Sole admin is selected automatically; multiple admins require server-side STUDENT_REGISTRATION_ADMIN_ID. Sessions become invalid on admin edits; deletion cascades sessions.
- Added /student/login, /student/register and protected /student own-profile page with logout. Reused LoginForm, AuthShell, StudentForm and LogoutButton with unchanged admin defaults; registration includes matching-password validation and existing contact/academic fields. Admin login links to student access. Separate HttpOnly student cookie, same-origin proxy, no browser-visible bearer tokens.
- Editor diagnostics clear. Added student session/rate-limit tables locally, resolved registration owner successfully and restarted backend task (PID 79068, port 8900); frontend already running on 3300. Existing accounts were not modified. Updated both READMEs and root progress.
- User will test manually: no automated/browser tests, sample accounts, production build or deployment. Registration is immediate; email verification, password recovery, faculty login and student self-editing are not included. Proxy-shared-IP throttling remains a production limitation.

## Student Passwords and Faculty

- Student deletion added: trash action beside Edit in desktop/mobile lists, named permanent-delete confirmation with Cancel focused, pending/error states and refreshed pagination. DELETE /admin/students/{record_id} is admin-owned, returns 404 for missing/unowned records and 409 for linked records. Same-origin authenticated student proxy supports bodyless DELETE; faculty deletion remains unsupported. Editor diagnostics clear; no automated/manual deletion tests or real record deletions performed, per user request to test manually. No schema migration required.

- Faculty name/role update: added required name and exact role choices HOD, Professor, Asst. Professor, Principal, Director to API writes and frontend create/edit; displayed on desktop/mobile and included in search. Nullable migration preserves legacy faculty without inventing names/roles. Eight backend tests pass, including all five roles, invalid/missing fields, legacy reads, repeated initialization, edit persistence and unchanged passwords. TypeScript, focused ESLint and editor checks pass. Applied local migration with faculty count unchanged (0), restarted backend task (PID 74384), and verified live health, required name/role schemas, exact role choices and API/proxy authentication. Authenticated visual checks remain pending; no production build/deployment.

- Added write-only student passwords (required on create, optional replacement on edit) with Argon2 hashing and a non-destructive nullable password_hash migration for existing students.
- Added admin-owned faculty create/list/edit endpoints with email, password and active status. Eight rollback-only tests pass, covering password hashing, exact whitespace preservation, replacement/preservation, sanitized validation errors and admin isolation.
- Added password visibility controls and Faculty sidebar/form/list using the existing responsive student patterns, search, IST date filters, pagination, error/empty/loading states and active account checkbox. New passwords require 12-1024 characters; a blank replacement keeps the current password. Existing students with no password are prompted to set one when editing.
- Shared authenticated records proxy and data loading between Students and Faculty. TypeScript, focused ESLint and editor diagnostics pass.
- Applied non-destructive local initialization and verified counts unchanged: 1 admin, 0 students, 0 faculty. No sample records or real credentials were read or changed. Restarted backend via its existing task (PID 70066, port 8900); frontend remains on 3300.
- Live health/schema, student/faculty API and proxy authentication/no-store, POST/PUT Origin rejection, unsupported faculty route rejection and protected dashboard redirect checks passed.
- Shared browser remains signed out, so authenticated form/table visual and interaction checks remain pending. Production build remains deferred pending visual approval. Student/faculty sign-in flows are not part of this management update; active status is currently a managed record field, not a login authorization implementation. No production deployment performed.

## Browser Extension Hydration Warning

- Added body-only `suppressHydrationWarning` in frontend/src/app/layout.tsx for the reported extension-injected `cz-shortcut-listen` attribute. Child hydration checks remain enabled. Editor diagnostics pass; verification in the user's extension-enabled browser remains pending.

## Scope

- Four-week Applied AI course for 60 students, all working individually.
- No team workspaces or group submissions. Student files and project state must be isolated.
- Roadmap HTML/PDF moved here; older references to teams in those materials have not yet been revised.
- Directory name currently includes a trailing space: `applied ai `.

## Backend Setup

- VS Code configured the workspace virtual environment at `/Users/redfoxhotels/arunachala/.venv`, using Python 3.13.14.
- FastAPI 0.141.1 and Uvicorn 0.54.0 installed in that environment.
- [backend/main.py](backend/main.py): minimal API with `GET /health`; generated documentation at `/docs`.
- [backend/requirements.txt](backend/requirements.txt): backend dependencies.
- Requested local address: `http://127.0.0.1:8900`.
- VS Code task `Applied AI: Backend (8900)` starts Uvicorn using the workspace environment and this backend's app directory.
- Verified: Python syntax, imports, health-route registration and editor diagnostics pass; live `/health` returns `{"status":"ok"}` and `/docs` returns HTTP 200.
- Server started locally on port 8900. No student code execution implemented; no production deployment performed.
- Frontend admin login is now implemented; see Frontend Admin Login below.

## PostgreSQL and Admin Setup

- Created local PostgreSQL database `applied-ai` and `admins` table. Repeated initialization preserves existing data.
- Table fields: identity `id`, lowercase unique `email`, Argon2id `password_hash`, and `created_at`.
- Added psycopg, python-dotenv, argon2-cffi and email-validator to the existing environment and dependency manifest.
- [backend/database.py](backend/database.py) reads `DATABASE_URL` from the ignored backend `.env`; default local connection is `postgresql:///applied-ai`.
- [backend/manage.py](backend/manage.py): `init` provisions database/table; `create-admin` reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment/backend `.env`, falling back to private prompts when both are blank. Passwords require at least 12 characters. Partial credentials are rejected; duplicate accounts do not overwrite credentials.
- Blank admin variables added to `.env` and `.env.example`. Dotenv interpolation disabled to preserve literal passwords. Clear the plaintext admin password after provisioning. From workspace root: `.venv/bin/python 'applied ai /backend/manage.py' create-admin`.
- Environment credential flow, Argon2id hashing, literal password handling, prompt fallback and invalid/partial/short credential rejection passed mocked database checks; no account created by these tests.
- From backend: `../../.venv/bin/python manage.py create-admin`. User subsequently ran this successfully and confirmed admin creation. The assistant cleared `ADMIN_PASSWORD` from `.env` and verified it is blank; the admin email and stored password hash were preserved.
- [backend/README.md](backend/README.md) documents configuration and commands; `.env.example` provides the connection template.
- Verified syntax, email normalization, Argon2id hashing, live database/schema/unique constraint and repeatable initialization. Initial setup had no admins; the user has since created the administrator.

## Admin Authentication

- Added [backend/auth.py](backend/auth.py): `POST /admin/login`, protected `GET /admin/me`, and protected `POST /admin/logout`.
- Login verifies the existing Argon2id hash; returns a random 256-bit bearer token with eight-hour expiry. Only its SHA-256 hash is stored in PostgreSQL.
- `admin_router` protects all its endpoints using reusable `require_admin`. Missing, malformed, unknown, expired, revoked and deleted-admin tokens are rejected with 401. Logout revokes only the current session.
- Generic login failures and unknown-user dummy hashing; database-backed ten-attempts-per-IP-per-minute login limit with 429/Retry-After responses. Authentication responses are non-cacheable.
- Non-destructive initialization created `admin_sessions` and `admin_login_limits`. Before/after comparison verified all existing admin records and hashes remained unchanged.
- Six regression tests in [backend/test_auth.py](backend/test_auth.py) passed against actual PostgreSQL in isolated rollback-only schemas, including route protection, expiry, logout and throttling. Syntax/import/OpenAPI checks passed; editor diagnostics clean.
- `/health`, `/admin/login` and API documentation remain public. Future protected routes must use `admin_router` or explicitly depend on `require_admin`.
- Restarted the verified local Uvicorn process using the existing VS Code task on port 8900. Live `/health` and `/docs` return 200; OpenAPI includes all three auth endpoints; `/admin/me` and `/admin/logout` reject unauthenticated HTTP requests with 401 and a Bearer challenge. No production deployment changes.

## Frontend Admin Login

- Initialized the existing [frontend](frontend/README.md) directory with Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind CSS 4 and official shadcn/ui controls. Locally bundled Inter, dark theme and maroon red accent.
- Login at `/` and `/admin/login`; password visibility, browser field validation, loading state and readable error feedback. Protected `/admin` now contains the dashboard described below.
- Same-origin Next.js handlers forward login/logout to FastAPI. Eight-hour HTTP-only cookie, SameSite=Lax, Secure in production, no token in browser JSON/local storage. Server-side identity checks and POST Origin checks.
- Backend login throttling currently groups proxied users under the Next.js server IP. Trusted proxy handling and production rate limiting remain to be configured before deployment.
- VS Code task `Applied AI: Frontend (3300)` is running locally at http://localhost:3300; backend remains on port 8900.
- TypeScript, ESLint and source editor diagnostics passed. Browser desktop 1440x960/mobile 390x844 checks found no horizontal overflow; Inter loading, password reveal/hide and mocked invalid-login recovery verified.
- Live HTTP checks passed for login page rendering, missing/invalid-session redirects, cross-origin rejection, input validation and stale-session cookie clearing. No real credentials used or changed. Successful real-account login/authenticated logout through the frontend remain untested.
- Production build deferred pending visual approval. No deployment performed. Setup and security details are in [frontend/README.md](frontend/README.md).

## Admin Dashboard

- Replaced the minimal account screen with [frontend/src/components/admin-dashboard.tsx](frontend/src/components/admin-dashboard.tsx): persistent desktop sidebar, collapsible mobile navigation, Overview, Course and Admin account views, and existing sign-out control.
- Overview shows known course facts: planned cohort of 60, four-week duration, individual coursework, institution and core topics. No fabricated enrollment, activity or progress statistics; no additional backend modules added.
- Existing Inter, charcoal and maroon styling retained. Server-side `getAdmin` authentication remains unchanged.
- Focused TypeScript and ESLint checks passed. Live `/admin` still redirects unauthenticated visitors to login. Dashboard visuals and navigation interactions await authenticated browser verification; no real credentials accessed, no production build or deployment.

## Students

- Added admin-owned student schema and protected list/create/update/summary API in backend/students.py, with non-destructive initialization in manage.py. College, degrees, streams, email/mobile and optional HTTPS profile links validated; student ID/email unique per admin.
- Seven rollback-only PostgreSQL tests pass, covering auth, student persistence, validation, duplicates, search/pagination/date filters and cross-admin isolation. Existing workspace Python environment reused.
- Frontend Students menu includes add/edit forms, a desktop table/mobile records, search, added-date filters (IST), pagination, loading/error/empty states and optional GitHub/LinkedIn links. Overview reads actual total/degree/stream counts; the previous static cohort, course duration and topics were removed from the dashboard.
- Same-origin Next.js student proxy uses the existing HTTP-only session cookie; mutations check Origin. TypeScript, focused ESLint and editor checks passed.
- Initialized schema without changing existing accounts and restarted local backend through its task (PID 57685). Live health, registered routes, backend/frontend unauthenticated 401 responses, mutation Origin403, no-store headers and protected dashboard redirect passed. Database verified: zero students, one existing admin. No sample records seeded.
- Authenticated dashboard/form visual and browser interaction checks remain pending because the shared browser is signed out. No password read/reset, production build or deployment performed.