This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3300](http://localhost:3300) with your browser to see the result.

The foundation uses TypeScript, the App Router, Tailwind CSS 4 and shadcn/ui (base-nova). Geist Sans is self-hosted through `next/font`. The fixed dark theme uses a black background and lime green (#bef264) primary/accent colors.

## Administrator Access

Open http://localhost:3300/admin/login for the compact shadcn sign-in form. The supplied Zyora Labs logo is served locally from public/zyora-labs.jpg. Successful sign-in opens /admin with a responsive sidebar, header, account details and sign-out control. The root URL redirects to /admin; unauthenticated requests redirect to sign-in.

The frontend calls FastAPI through same-origin POST /api/admin/login and /api/admin/logout handlers. Tokens remain in the HttpOnly applied_ai_admin cookie, never in browser JSON or local storage. Cookies use SameSite=Lax, a maximum eight-hour lifetime and Secure in production. Dashboard requests validate the current session through GET /admin/me without caching. Mutation routes validate Origin and bound login payload size.

The server-only API_BASE_URL defaults to http://127.0.0.1:8900 for development. Run the existing workspace backend task alongside the frontend task. Production startup requires explicit HTTPS APP_ORIGIN and private API_BASE_URL. Proxied logins share a 300/minute/role upstream-IP allowance while each email remains limited to 10/minute. See [the deployment guide](../RENDER.md) for required settings, safe database initialization and hosted acceptance checks. A local production build does not validate runtime credentials.

Run focused authentication checks with `node --test tests/admin-auth.test.mjs`. These exercise the actual route/session modules using mocked backend responses without modifying accounts. TypeScript and focused ESLint checks also passed. Real-account sign-in and authenticated dashboard visual checks remain pending; no production build was run.

Theme tokens are in src/app/globals.css. Student and faculty management and programme week-access controls are implemented below; no old syllabus or content management UI has been restored.

## Student Management

Sign in and open http://localhost:3300/admin/students. The sidebar includes Students. The module includes search, creation-date filters in Asia/Kolkata, pagination, a desktop table and mobile cards.

- `/admin/students/new`: create a student with personal, education and account details.
- `/admin/students/[id]`: dedicated student profile page, not a dialog.
- `/admin/students/[id]/edit`: edit details and active status without exposing passwords.
- The action menu provides view, edit, password reset and delete. Reset requires matching 8-128 character passwords. Delete deactivates and archives the record; its student ID/email remain reserved.

All backend student queries are scoped to the signed-in administrator who created the student. Passwords are hashed with Argon2 and never returned. The same-origin `/api/admin/students/` bridge keeps bearer tokens server-side, validates mutation Origin, limits request size, allowlists routes/filters and disables caching.

For a **new database**, run `python manage.py init-schema` from the backend with the required environment supplied. For an existing database without a migration ledger, back up first and follow the verified baseline procedure in [the deployment guide](../RENDER.md). Never replay raw SQL or the initial schema over existing data. Existing unowned student rows require an explicit ownership decision.

Run frontend checks with `node --test tests/admin-auth.test.mjs tests/students.test.mjs`. From the backend directory, run the existing workspace virtual environment's Python with `-m unittest test_email_settings.EmailSettingsTests test_faculty.FacultyTests test_students.StudentTests test_admin_auth.AdminAuthTests -v`. Backend tests use temporary PostgreSQL schemas and roll back all data. Current results: seventeen backend tests and twenty-four frontend tests pass, along with TypeScript, focused lint and live route/authentication checks. Authenticated browser click-through and visual review remain pending; no production build or deployment was performed.

## Student Invitations

In Students, select individual inactive students, Select page, or Select all matching inactive (up to 1,000 matching records). Selections remain across pages and clear when filters change. Send invitations opens a recipient confirmation dialog; no email is sent before confirmation. Sending is sequential with per-recipient outcomes and Stop after current email. Provider acceptance is not proof of inbox delivery. No automatic retries occur; selecting the same student again resends, with a 60-second cooldown.

The email's Set up password button opens `/student/setup-password`. Students enter matching 8-128 character passwords, activate their account, then sign in. Links expire in 24 hours and work once. Resending, editing the student, activation or archiving invalidates older links. Only token hashes are stored; the URL fragment is removed on page load and tokens are submitted in private POST bodies. Refreshing the setup page requires reopening the email link.

Set backend `STUDENT_APP_ORIGIN` to the verified public HTTPS frontend origin, without a path. No default is provided: invitations are blocked when it is absent. Local HTTP origins are allowed only for localhost/127.0.0.1 with APP_ENV=local, and must never be emailed to real students. Configure the frontend APP_ORIGIN separately for production origin validation. Saved administrator email settings are required. Invitation validation and setup share limits of 10 attempts per token and 300 per proxy IP per minute. Existing login limits are unchanged; review trusted proxy/client-IP handling before classroom sign-in rollout.

Use the migration CLI and existing-database baseline procedure above, not direct SQL replay. At the invitation implementation milestone, storage was added locally with all 60 student records unchanged (59 inactive, 1 active), and zero invitations. No real student invitations or production changes were made at that milestone. Backend tests use rolled-back schemas and mocked mail; frontend tests mock the upstream service. Live authenticated administrator sending remains untested.

Invitation verification: 52 frontend tests, 22 backend tests, TypeScript and editor checks pass. The local backend was restarted and all three invitation routes are present in OpenAPI. Browser mocks exercised the setup success state; images loaded and no horizontal overflow was measured at 390px/1440px. Normal browser clicks and screenshot capture stalled, so full visual and signed-in administrator walkthroughs remain unverified. No production build/deployment was performed. STUDENT_APP_ORIGIN remains unset until the public student-site origin is confirmed.

## Faculty Management

Open http://localhost:3300/admin/faculty after signing in. The Faculty sidebar opens a searchable list with IST creation-date filters, pagination, desktop table and mobile cards.

- `/admin/faculty/new`: create a faculty member with name, email, role, password confirmation and active status.
- `/admin/faculty/[id]`: dedicated profile page.
- `/admin/faculty/[id]/edit`: edit details and active status without changing the password.
- The required shadcn role dropdown contains exactly Principal, HOD, Professor and Asst. Professor. The backend enforces the same values.
- Action menus provide view, edit, password reset and archive-delete. Passwords require 8-128 characters and matching confirmation. Archived records are retained and their emails remain reserved.

Faculty records are isolated by creator administrator. The `/api/admin/faculty/` proxy keeps tokens server-side and validates Origin, routes, methods, filters and bounded JSON bodies. Backend responses never include password hashes.

Apply backend/faculty_management.sql once the base schema exists. It adds nullable admin ownership and an index without assigning or deleting existing rows. It has been applied locally after confirming the faculty table was empty. For a new database, the sequence is schema.sql, admin_auth.sql, student_management.sql, faculty_management.sql, email_settings.sql, student_auth.sql, programme.sql, google_drive.sql, submissions.sql, faculty_auth.sql, faculty_portal.sql. Existing unowned faculty require an explicit ownership decision; never replay the base schema over existing data.

The existing backend task was restarted on port 8900. Live checks confirm the exact role schema, private unauthenticated API rejection, mutation Origin protection and sign-in redirects for all faculty pages. Automated tests cover CRUD, every role, owner isolation, password preservation/reset, archive behavior, filters, proxy guards, form rendering and link-button semantics. Authenticated visual/click-through review is still pending because the shared browser is signed out.

## Faculty Portal

Open http://localhost:3300/faculty/login. Active faculty accounts created through Admin > Faculty use their own email/password. Sign-in opens `/faculty`, listing all nonarchived students owned by the same administrator, with search, IST registration-date filters, pagination and separate practical/homework status for each week. Open a student to view their profile, select a week and submission type, filter submission dates, download an immutable notebook snapshot, or review work.

Reviews require an integer grade from 0 to 100 and written feedback. Each saved review is appended to permanent history; newer reviews supersede earlier grades without overwriting them. Concurrent stale reviews are rejected: close the dialog and refresh before reviewing again. Students see the latest grade, feedback and reviewer in their submission history. Faculty can review saved work after a week is locked; student access still follows administrator week controls. Notebooks are downloaded, never executed or rendered in the portal.

Faculty authentication uses its own `applied_ai_faculty` HttpOnly cookie and hashed eight-hour backend sessions. Admin/student cookies cannot authorize faculty requests. Account edits, password resets, deactivation and archive invalidate existing sessions. Every monitoring, attachment and grading endpoint enforces creator-admin ownership; unowned faculty cannot sign in.

For existing databases, apply only backend/faculty_auth.sql and backend/faculty_portal.sql once after faculty_management.sql and submissions.sql. These additive migrations are now applied locally; the preservation check confirmed all 60 student records unchanged. Existing submissions default to homework without updating snapshot bytes. No faculty account, review or email was created. The local backend has been restarted and live route registration, unauthenticated rejection, protected-page redirect and mutation Origin checks pass.

Validation: all 54 frontend tests, 44 backend test executions, TypeScript and editor checks pass. Faculty tests use isolated rollback-only PostgreSQL schemas and exercise owner isolation, authentication, grading conflicts, immutable history and student feedback. Login images load and desktop/mobile geometry has no horizontal overflow; mobile screenshots were inspected. Signed-in monitoring/grading, a real Drive-backed submission and full dashboard visual review remain pending because there are no local faculty accounts. No production build or deployment was performed.

## Password Change and Student Access

Students can open `/profile` from the sidebar or header account pill to view their account details and change their password. The form requires the current password and matching new passwords (8-128 characters, different from the current password). Successful changes revoke all sessions for that student and clear only the student cookie; select Sign in again afterward. The protected `PUT /student/password` backend revalidates the session under an account lock, verifies the current Argon2 hash, and updates/revokes atomically. The same-origin `/api/student/password` proxy enforces Origin, student cookie and bounded payload checks. No schema migration is needed. Profile details are read-only.

Admin Settings includes current password, new password and confirmation. Successful changes revoke every admin session and expire the admin cookie; select Sign in again afterward. New passwords require 8-128 characters and must differ from the current password. Password whitespace is preserved.

Open http://localhost:3300/student/login for student sign-in. The responsive split layout uses an Unsplash photo of engineering students in Chengannur, Kerala, by [Aswin Thomas Bony](https://unsplash.com/photos/SPO0ST4nVbY), available under the Unsplash License. The image is loaded directly from images.unsplash.com and requires network access. On mobile the image sits above the form.

Existing active students sign in with their email and password. The separate applied_ai_student HttpOnly cookie cannot authorize admin routes. Eight-hour hashed backend sessions are invalidated on account changes, deactivation, archive or logout. Successful sign-in opens /dashboard; the old /student URL redirects there. No registration/recovery workflows are included.

The protected /dashboard and /programme routes share a compact 208px shadcn sidebar, collapsible to a 56px icon rail using the footer toggle. Mobile navigation uses a drawer and closes when a route is selected. Navigation highlights the current page and collapsed icons have tooltips. The dashboard displays programme cards and real student account details. Programme uses a short AI visualization cover and topic strip, followed by compact Week 1-4 title/status cards in a four-column desktop and two-column mobile grid. Its composition references the [official shadcn image card](https://ui.shadcn.com/docs/components/base/card#image). The cover loads directly from images.unsplash.com and requires network access. Week content is not published yet; no old syllabus has been restored. Focused programme rendering tests and editor diagnostics pass. Isolated static page/shell screenshots at 1366x768 and 390x844 verified that all four week cards fit within the viewport, the AI image loads and there is no horizontal overflow. Live signed-out route protection was verified. Authenticated interaction review and toggle/mobile click-through remain pending; no production build was run.

Apply only backend/student_auth.sql to the existing database after admin_auth.sql is present. This additive migration has been applied locally without changing account counts, and the backend has been restarted. Desktop/mobile layout measurements and image loading pass. Integrated screenshot capture was clipped and browser button interaction stalled; full visual review and real-account sign-in/password-change checks remain pending. No real credentials were changed during implementation.

## Programme Week Access

The current student URL is http://localhost:3300/student/programme, with week pages at /student/programme/1 through /student/programme/4. Student navigation and locked-week redirects use these URLs. Previous /programme and /programme/[week] URLs redirect to their new equivalents within the protected student layout. This supersedes older route references in the implementation history above. Nine focused route/render/authentication checks and live signed-out checks pass for this relocation; no page content, backend or database changes were required.

Open http://localhost:3300/admin/programme after admin sign-in. Each of the four cards has an Unlocked checkbox: checked opens that week to the administrator's students; unchecked locks it. A saved status is shown only after confirmation from the backend. Failures leave the last confirmed state visible with an error; refresh to resolve an uncertain save.

All weeks default locked. Settings are scoped to each administrator; students read the settings of their creator admin. Unowned students remain locked. Locked cards stay visible on /student/programme without links. Unlocked cards open /student/programme/1 through /student/programme/4 with Overview, Handbook, Homework and Submission views. Week 1 materials are described below; weeks 2-4 lesson content remains Content coming soon. The backend rejects direct access to locked weeks with403, and the page guard redirects to /student/programme. Every new page request rechecks access without caching; cards use full-page links rather than prefetched navigation. Locking does not remove content already displayed in an open browser tab.

The private same-origin /api/admin/programme proxy validates Origin, authentication, path, strict boolean payload and bounded body size. Backend settings use a separate table so toggling weeks does not invalidate admin sessions. Apply only backend/programme.sql once to an existing database. It has been applied locally in a transaction, preserving account counts (1 admin,1 student,0 faculty); no seed settings or account changes were made. The existing backend task has been restarted successfully.

From the backend directory, run the existing virtual environment's Python with `-m unittest test_programme.ProgrammeTests -v`. Its two temporary-schema, rollback-only tests cover default locks, unlock/relock, direct access, owner isolation, authentication and strict validation. Frontend `node --test tests/admin-auth.test.mjs tests/students.test.mjs` passes all34 tests, including seven programme-related checks. TypeScript/editor checks and live unauthenticated API/page/Origin guards pass. Static previews of the actual admin and student components were inspected at1366x768 and390x844, with no horizontal overflow and all four student cards inside the viewport. Real-account browser save click-through is unverified because the shared browser is signed out; no production build or deployment was performed.

## Week 1 Learning Materials

Open http://localhost:3300/student/programme/1?tab=handbook after student sign-in and administrator unlock. The overview records Monday September 28 (programme overview), Wednesday September 30 (onboarding/PyTorch handbook), and Friday October 2, 2026 (continuation/exercises/homework).

The handbook is split across two days. Wednesday follows the first-day seminar with six short sections: what PyTorch is, why it helps AI/ML training, how it is built, tensors, Colab setup and three connected temperature examples (store, correct, average). Training-cycle, software-layer and scalar/vector/matrix diagrams explain the concepts before code. Each example has expected output and line-by-line explanations; a short recap checks understanding. There is no Wednesday submission, portal Drive-connection requirement or advanced API reference. Friday retains its six continuation lessons: reshaping, broadcasting, matrix multiplication, prediction/loss, autograd and the training loop, with six examples, references, exercises and homework.

Friday's Handbook & Exercises view retains the ?tab=homework URL. Its continuation handbook, diagrams, classroom exercises and independent homework are rendered only on or after October 2, 2026 at 12:00 AM IST (October 1 at 18:30 UTC). The server-only release rule also protects direct URLs and direct Friday handbook rendering; refresh or reopen the view after release. Students finish the Friday lessons, complete the exercises and independent calibration notebook, then use the separate Submission view. This date gate does not change the administrator's week lock or the existing Submission service; no deadline or automatic grading is invented. Unknown or repeated tab parameters default to Overview.

Light-introduction validation: all 29 student tests, `tsc --noEmit` and editor checks pass. Tests check exactly three Wednesday code cells, outputs, concept/diagram order, contents links, absence of advanced examples and preservation of Friday's gate and examples. An isolated actual-component preview with app CSS fits1366px and390px without page/figure overflow; mobile contents navigation works and tensor/example screenshots were inspected. This is not signed-in end-to-end verification. The three connected Python examples were not executed during this revision. No production build/deploy, account changes or administrator unlock was performed. This section supersedes earlier full-Wednesday and six-foundation Wednesday handbook statements in the implementation history above.

## Student Google Drive Connection

Student Profile includes Connect Google Drive, Reconnect and Disconnect, separate from portal sign-in. Connection status means an encrypted refresh token is saved, not that Google has just validated the grant. Disconnect deletes this portal's saved credentials and pending attempt; it does not revoke permissions at Google. Remove the app's access in your Google Account to revoke the grant there.

In the existing Google OAuth Web application's Authorized redirect URIs, register exactly:

```text
http://localhost:3300/api/student/google-drive/callback
```

Keep the authorized JavaScript origin `http://localhost:3300` and the existing Production consent configuration. Only `https://www.googleapis.com/auth/drive.file` is requested. Backend `.env` holds `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; the existing backend task explicitly loads that file. The user has confirmed real Google connection after updating the shared project-level consent branding to Applied AI.

Connected students can select a notebook from Profile > Google Drive or an unlocked programme week. The official Google Picker loads on demand and browses Drive in list mode without requesting thumbnail access. Only one `.ipynb` file is accepted; folders, shortcuts, invalid IDs and other extensions are rejected. Selection stores only ID/name in page memory and is lost on navigation/reload. Profile selection does not submit anything; the week page has a separate Submit notebook action that fetches, validates and stores the notebook server-side. MIME types are not restricted to one notebook type because Colab and uploaded notebooks can differ. The user has confirmed real Google connection and Picker selection work.

Picker uses the configured `GOOGLE_PICKER_API_KEY` and numeric `GOOGLE_PROJECT_NUMBER`, both from the same project as the OAuth client. Enable Google Picker API and Drive API. Restrict the browser API key to Google Picker API and the allowed website referrers `http://localhost:3300/*` and `https://docs.google.com/*` (plus the actual app origin when deployed). A browser Picker key and project number are necessarily public configuration; the OAuth client secret, encryption key and refresh token are never returned to the browser.

POST `/api/student/google-drive/picker` checks the private student cookie and exact Origin, then calls authenticated POST `/student/google-drive/picker`. The backend decrypts the saved refresh token, requests a short-lived access token using a fixed HTTPS endpoint with no redirects, a timeout and bounded response, and rechecks the session and saved connection before returning. Revoked grants prompt reconnection; uncertain provider failures preserve the saved connection. Responses are no-store/no-referrer and allowlist only the temporary access token, lifetime and Picker configuration. The access token is passed directly to official Picker in memory, never local storage or application logs. Closing the Picker, choosing a file, leaving the page or token expiry disposes the dialog; loading errors allow retry. Disconnect removes local credentials but cannot invalidate an already-issued Google access token before Google expires or revokes it.

Apply only backend/google_drive.sql once to the existing database after student_auth.sql. It has been applied transactionally to verified local applied-ai with account counts unchanged (1 admin,1 student,0 faculty) and zero Google connections. The existing backend task has been restarted, with environment loading and startup confirmed. Never replay initial schemas or overwrite existing data. The new student_google_drive table stores hashes for OAuth state/session binding, encrypted PKCE verifier and encrypted refresh token; no student account timestamps or portal sessions are changed.

The local first connection creates backend/.secrets/google-drive.key (0600), separate from the email encryption key. Back up this key securely with the database. Losing or replacing it prevents decryption of saved Google credentials. For nonlocal use, set backend APP_ENV to a nonlocal value, provide a stable GOOGLE_DRIVE_ENCRYPTION_KEY (Fernet) and GOOGLE_REDIRECT_URI (HTTPS), and set frontend APP_ORIGIN to the same public origin. Never commit credentials or keys. Callback request queries contain short-lived authorization codes: redact query strings in access logs when configuring hosting and monitoring.

The same-origin proxy validates mutation Origin, pins Google's authorization destination, and uses a private SameSite=Lax ten-minute state cookie. Backend attempts bind to the current student and exact portal session, use PKCE S256, expire after ten minutes, and are consumed before token exchange. Reconnect failures retain any previous saved connection. Callback responses are no-store/no-referrer and redirect only to fixed profile/login outcomes without including Google codes or raw provider errors.

Eight rollback-only backend tests (`-m unittest test_google_drive.GoogleDriveTests -v`) and all41 frontend tests pass, along with TypeScript and editor checks. Tests cover Picker credentials, session/disconnect races, response validation, revoked grants, bounded transport, proxy guards, notebook validation and Picker cancellation/disposal. The backend task was restarted successfully with environment loading confirmed. Live Picker API/proxy 401, foreign-Origin 403, GET 405 and no-store/nonredirect responses pass. An isolated actual-component preview at1366x768 and390x844 fits a long filename without horizontal overflow; font fallback was used in that static preview. Google transport and Picker are mocked in automated tests. Real OAuth consent is user-confirmed; real signed-in Google Picker selection and its third-party dialog layout remain unverified. No database migration, production build/deployment or account changes were made for Picker.

## Notebook Submissions

Open the Submission view of an unlocked week at http://localhost:3300/student/programme/1?tab=submission (or weeks 2-4), choose Practical or Homework, select a Drive notebook, then choose Submit notebook. Each type has separate history, and changing type clears the current selection. A successful save returns a receipt ID, server timestamp in IST, SHA-256 and private download. History persists across reloads and includes IST date filters, ten-item pagination, desktop rows and mobile cards, plus the latest faculty grade and feedback. Week 1 has a separate Wednesday handbook and date-gated Friday homework; downloadable starter notebooks are not included.

The backend downloads directly from Google using the student's saved grant. It validates metadata before and after downloading, verifies size and any supplied checksum, and validates strict JSON notebook format 4, minor versions 0-5, with nbformat. Limits are 2 MiB per notebook and twenty saved attempts per student/week/type. No notebook code is executed or rendered, and there is no automatic grading; faculty grade manually. Original bytes are stored as an immutable database snapshot, unaffected by later Drive edits or disconnection; reconnecting is needed only for new submissions. Week locks block student saving, history and downloads without deleting saved records.

Retries for the same current selection reuse a request UUID and return the existing receipt instead of duplicating a save. After an uncertain error or page reload, check history before creating another attempt. Changing or clearing the selection starts a new attempt. Student identity comes only from the authenticated session; ownership, session validity and week access are checked again before saving. History and attachments remain private and no-store; downloads use attachment headers and never render notebook content in the portal.

Apply backend/submissions.sql only once, after the existing student management/authentication, programme and Google Drive migrations. It has already been applied to verified local applied-ai/public, preserving 1 admin, 1 student, 0 faculty and 1 Google connection; the new table initially contained zero submissions. Never replay base schemas. The existing virtual environment has nbformat 5.11.1 installed and backend requirements declare nbformat>=5.11,<6. The backend task was restarted successfully on port 8900.

Validation: six focused rollback-only submission tests, all 77 backend test executions (discovery includes repeated imported test classes), all 44 frontend tests, TypeScript and editor checks pass. Live route registration, unauthenticated API rejection, mutation Origin/method guards and week-page login redirects pass. Isolated actual-component sample receipts were visually inspected at 1366x900 and 390x844 with the real theme, Geist and logo; long filenames, receipts and history fit without horizontal overflow. This was a static layout check, not authenticated interaction testing. A real Drive-backed submission still needs signed-in user verification. No production build or deployment was performed.

## Admin Email Settings

Open http://localhost:3300/admin/settings after signing in. Enter From name, From email and the ZeptoMail Send-mail token. The sender must be authorized in the same ZeptoMail account as the token. Saving settings does not send a test email or verify provider credentials. Leave the token blank on later edits to retain it; entering a new token replaces it. The browser receives only sender fields and token_configured, never the saved token or ciphertext.

New student/faculty accounts submit a welcome email containing the email address and exact initial password after the database transaction commits. Passwords remain Argon2 hashes in application storage; the plaintext credential is necessarily shared with ZeptoMail and the recipient mailbox. Use unique initial passwords. Existing accounts, edits and password resets do not send email. Welcome email templates currently omit login URLs; student access is available at /student/login and faculty access at /faculty/login.

The creation screen distinguishes provider acceptance (not confirmed delivery), missing settings and failed/unconfirmed submission. An email failure leaves the account saved. Do not create the same account again; there are no automatic retries or plaintext password queues.

Apply only backend/email_settings.sql to an existing database. This additive per-admin settings table has been applied locally with account counts unchanged. Install backend requirements, including cryptography, in the existing virtual environment.

Tokens are encrypted with Fernet. In local mode, the first token save creates backend/.secrets/zeptomail.key with 0600 permissions in a 0700 directory; .secrets is ignored by Git. Back up this key securely with the database: losing it makes saved tokens unreadable. For nonlocal operation, set APP_ENV to a nonlocal value and supply a stable EMAIL_SETTINGS_KEY containing a valid Fernet key through the server's secret configuration. Do not rotate or overwrite that key without re-encrypting tokens or re-entering them. Never commit keys or tokens.

The server defaults to https://cpaas.zoho.in/v1.1/email, matching this account's India API snippet. For another regional ZeptoMail account, set server-only ZEPTOMAIL_API_URL to the full HTTPS send-mail URL shown in that account's API setup. Requests use POST, JSON Accept/Content-Type headers and the Zoho-enczapikey authorization prefix, with the saved full sender address. Account emails retain textbody rather than the snippet's sample htmlbody. Requests do not follow redirects or retry automatically. Provider errors and credentials are not returned to the browser.

Automated checks cover encrypted storage, token preservation/replacement, owner isolation, secret filtering, exact credential payloads, duplicate prevention, provider failures and confirmation states. Live settings guards and sign-in redirects pass. Real delivery and authenticated visual review remain unverified: no sender/token has been supplied, and the shared browser is signed out.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
