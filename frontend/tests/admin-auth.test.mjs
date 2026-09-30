import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const origin = "http://localhost:3300";
const token = "a".repeat(43);

test("production startup requires explicit origins without affecting build or development", () => {
  const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const { PHASE_PRODUCTION_SERVER, PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER } = require("next/constants");
  function load(env) {
    const exports = {};
    vm.runInNewContext(outputText, { exports, require, URL, process: { env } });
    return exports.default;
  }
  for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER]) assert.doesNotThrow(() => load({})(phase));
  const valid = { APP_ORIGIN: "https://portal.example.com", API_BASE_URL: "http://backend:10000" };
  assert.doesNotThrow(() => load(valid)(PHASE_PRODUCTION_SERVER));
  for (const origin of [undefined, "http://portal.example.com", "https://portal.example.com/", "https://user:secret@portal.example.com", "https://portal.example.com/path"]) {
    assert.throws(() => load({ ...valid, APP_ORIGIN: origin })(PHASE_PRODUCTION_SERVER), /APP_ORIGIN/);
  }
  for (const backend of [undefined, "backend:10000", "ftp://backend", "http://user:secret@backend", "http://backend/path", "http://backend?query"])
    assert.throws(() => load({ ...valid, API_BASE_URL: backend })(PHASE_PRODUCTION_SERVER), /API_BASE_URL/);
});

test("faculty proxy isolates sessions, checks routes and protects grading writes", async () => {
  const calls = [];
  let upstream = () => Response.json({ access_token: token, expires_at: new Date(Date.now() + 3600000).toISOString() });
  function load(path, overrides = {}) {
    const exports = {};
    const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    vm.runInNewContext(outputText, { exports, Buffer, URL, AbortSignal, process: { env: {} },
      require: name => name in overrides ? overrides[name] : require(name), fetch: async (...args) => { calls.push(args); return upstream(...args); } });
    return exports;
  }
  const session = load("../src/lib/faculty-session.ts", { "server-only": {}, "next/headers": { cookies: async () => ({ get: () => undefined }) }, "next/navigation": { redirect: path => { throw new Error(path); } } });
  await assert.rejects(session.requireFaculty(), /\/faculty\/login/);
  const route = load("../src/app/api/faculty/[...path]/route.ts", { "@/lib/faculty-session": session, "@/lib/submissions": load("../src/lib/submissions.ts") });
  const request = (method, path, body, headers = {}, query = "") => route[method](new NextRequest(`${origin}/api/faculty/${path}${query}`, {
    method, headers: { origin, "content-type": "application/json", cookie: `applied_ai_faculty=${token}`, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ path: path.split("/") }) });
  assert.equal((await request("POST", "login", { email: "test@example.com", password: "password" }, { origin: "https://other.example" })).status, 403);
  assert.equal((await request("GET", "students", undefined, { cookie: `applied_ai_admin=${token}` })).status, 401);
  assert.equal((await request("GET", "students/../me")).status, 404);
  assert.equal((await request("DELETE", "students/1")).status, 405);
  assert.equal((await request("GET", "students", undefined, {}, "?admin_id=2")).status, 422);
  assert.equal(calls.length, 0);
  const login = await request("POST", "login", { email: "test@example.com", password: " password " });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /applied_ai_faculty=.*HttpOnly.*SameSite=lax/);
  assert.deepEqual(await login.json(), { success: true });
  assert.equal(JSON.parse(calls[0][1].body).password, " password ");
  upstream = () => Response.json({ items: [], total: 0 });
  const listing = await request("GET", "students", undefined, {}, "?search=Test&page=1");
  assert.equal(listing.headers.get("cache-control"), "no-store");
  assert.equal(calls.at(-1)[0], "http://127.0.0.1:8900/faculty/students/?search=Test&page=1");
  const reviews = "students/1/submissions/31a4f0ee-6bda-4f70-928e-34b980d41756/reviews";
  for (const body of [{ score: 101, feedback: "Text" }, { score: 80, feedback: " " }, { score: 80, feedback: "Text", faculty_id: 1 }]) assert.equal((await request("POST", reviews, body)).status, 422);
  assert.equal((await request("POST", reviews, { score: 80, feedback: "Text" }, { origin: "https://other.example" })).status, 403);
  upstream = () => Response.json({ detail: "database secret" }, { status: 409 });
  const conflict = await request("POST", reviews, { score: 80, feedback: "Text" });
  assert.equal(conflict.status, 409);
  assert.match(await conflict.text(), /newer review/);
  upstream = () => new Response("{}", { headers: { "Content-Type": "text/html" } });
  const downloaded = await request("GET", reviews.replace("reviews", "download"));
  assert.equal(downloaded.headers.get("content-security-policy"), "sandbox");
  assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
  upstream = () => new Response(null, { status: 204 });
  const logout = await request("POST", "logout");
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie"), /applied_ai_faculty=.*Max-Age=0/);
});

test("public invitation proxy validates secrets, origin and setup payloads without setting a session", async () => {
  const harness = setup({ role: "student", upstream: async () => Response.json({ name: "Test Student", email: "student@example.com", expires_at: "2026-10-01", token_hash: "private" }) });
  assert.equal((await harness.post("invitation", { token }, { origin: "https://other.example" })).status, 403);
  assert.equal((await harness.post("invitation", { token: "short" })).status, 422);
  assert.equal((await harness.post("setup-password", { token, password: "short", confirm_password: "short" })).status, 422);
  assert.equal((await harness.post("setup-password", { token, password: "valid-password", confirm_password: "other-password" })).status, 422);
  assert.equal(harness.calls.length, 0);
  const response = await harness.post("invitation", { token });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(await response.text(), /private|token_hash/);
  assert.equal(JSON.parse(harness.calls[0][1].body).token, token);
  const success = setup({ role: "student" });
  const saved = await success.post("setup-password", { token, password: " padded-password ", confirm_password: " padded-password " });
  assert.equal(saved.status, 204);
  assert.equal(saved.headers.get("set-cookie"), null);
  assert.equal(JSON.parse(success.calls[0][1].body).password, " padded-password ");
  for (const status of [400, 422, 429, 500]) {
    const result = await setup({ role: "student", upstream: async () => Response.json({ detail: "private secret" }, { status }) }).post("invitation", { token });
    assert.equal(result.status, status === 500 ? 503 : status);
    assert.doesNotMatch(await result.text(), /private secret/);
  }
});

test("Google Picker validates notebooks and disposes on selection, cancellation and abort", async () => {
  let callback;
  let disposed = 0;
  const configured = {};
  class View {
    setMode(mode) { configured.mode = mode; return this; }
    setIncludeFolders() { return this; }
    setSelectFolderEnabled() { return this; }
  }
  class Builder {
    addView() { return this; }
    setOAuthToken(value) { configured.token = value; return this; }
    setDeveloperKey(value) { configured.key = value; return this; }
    setAppId(value) { configured.project = value; return this; }
    setOrigin(value) { configured.origin = value; return this; }
    setTitle() { return this; }
    setSize() { return this; }
    setCallback(value) { callback = value; return this; }
    build() { return { setVisible() {}, dispose() { disposed++; } }; }
  }
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL("../src/lib/google-picker.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, { exports, window: { setTimeout, clearTimeout, innerWidth: 1200, innerHeight: 800,
    location: { origin }, google: { picker: { DocsView: View, DocsViewMode: { LIST: "list" }, PickerBuilder: Builder, Action: { PICKED: "picked", CANCEL: "cancel" } } } } });
  const session = { access_token: "temporary", api_key: "key", project_number: "123", expires_in: 3600 };
  const controller = new AbortController();
  const chosen = exports.pickNotebook(session, controller.signal);
  await Promise.resolve();
  callback({ action: "loaded" });
  assert.equal(disposed, 0);
  callback({ action: "picked", docs: [{ id: "notebook_123", name: "Week 1.ipynb", url: "https://untrusted.example" }] });
  assert.equal(JSON.stringify(await chosen), JSON.stringify({ id: "notebook_123", name: "Week 1.ipynb" }));
  assert.deepEqual(configured, { mode: "list", token: "temporary", key: "key", project: "123", origin });
  for (const docs of [[], [{ id: "id", name: "other.pdf" }], [{ id: "../invalid", name: "file.ipynb" }],
    [{ id: "id", name: "folder.ipynb", mimeType: "application/vnd.google-apps.folder" }],
    [{ id: "id", name: "file.ipynb" }, { id: "id2", name: "file2.ipynb" }]]) {
    const invalid = exports.pickNotebook(session, controller.signal);
    await Promise.resolve();
    callback({ action: "picked", docs });
    await assert.rejects(invalid, /Select a Jupyter notebook/);
  }
  const cancelled = exports.pickNotebook(session, controller.signal);
  await Promise.resolve();
  callback({ action: "cancel" });
  assert.equal(await cancelled, null);
  const aborted = exports.pickNotebook(session, controller.signal);
  await Promise.resolve();
  controller.abort();
  assert.equal(await aborted, null);
  assert.equal(disposed, 8);
});

function setup({ upstream = async () => new Response(null, { status: 204 }), cookie, env = {}, role = "admin" } = {}) {
  const calls = [];
  function load(path, overrides = {}) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
      exports,
      require: (name) => name in overrides ? overrides[name] : require(name),
      process: { env: { NODE_ENV: "test", ...env } },
      Buffer, URL, AbortSignal,
      fetch: async (...args) => { calls.push(args); return upstream(...args); },
    });
    return exports;
  }
  const session = load(`../src/lib/${role}-session.ts`, {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
    "next/navigation": { redirect: (path) => { throw new Error(`redirect:${path}`); } },
  });
  const route = load(`../src/app/api/${role}/[action]/route.ts`, { [`@/lib/${role}-session`]: session });
  const passwordPath = role === "student" ? "student/password" : "admin/settings/password";
  const passwordRoute = load(`../src/app/api/${passwordPath}/route.ts`, { [`@/lib/${role}-session`]: session });
  function post(action, body, headers = {}) {
    return route.POST(new NextRequest(`${origin}/api/${role}/${action}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { params: Promise.resolve({ action }) });
  }
  function changePassword(body, headers = {}) {
    return passwordRoute.PUT(new NextRequest(`${origin}/api/${passwordPath}`, {
      method: "PUT", headers: { origin, "content-type": "application/json", cookie: `applied_ai_${role}=${token}`, ...headers }, body: JSON.stringify(body),
    }));
  }
  const programme = load("../src/lib/programme.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
    "next/navigation": { redirect: (path) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not found"); } },
    "@/lib/admin-session": { ADMIN_COOKIE: "applied_ai_admin", adminRequest: session.adminRequest },
    "@/lib/student-session": { STUDENT_COOKIE: "applied_ai_student", TOKEN_PATTERN: session.TOKEN_PATTERN, studentRequest: session.studentRequest },
  });
  const driveRoute = load("../src/app/api/student/google-drive/[[...path]]/route.ts", { "@/lib/student-session": session });
  const submissionRoute = load("../src/app/api/student/submissions/[...path]/route.ts", {
    "@/lib/student-session": session, "@/lib/submissions": load("../src/lib/submissions.ts"),
  });
  function submissionRequest(method, path = ["1"], { query = "", headers = {}, body } = {}) {
    return submissionRoute[method](new NextRequest(`${origin}/api/student/submissions/${path.join("/")}${query}`, {
      method, headers: { origin, "content-type": "application/json", cookie: `applied_ai_student=${token}`, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { params: Promise.resolve({ path }) });
  }
  function driveRequest(method, path = [], { query = "", headers = {} } = {}) {
    return driveRoute[method](new NextRequest(`${origin}/api/student/google-drive/${path.join("/")}${query}`, {
      method, headers: { origin, cookie: `applied_ai_student=${token}`, ...headers },
    }), { params: Promise.resolve({ path }) });
  }
  return { post, session, calls, changePassword, programme, driveRequest, submissionRequest };
}

test("submission proxy guards requests and keeps receipts and downloads private", async () => {
  const id = "31a4f0ee-6bda-4f70-928e-34b980d41756";
  const receipt = { id, week: 1, filename: "Homework.ipynb", sha256: "a".repeat(64), submitted_at: "2026-09-30T10:00:00Z", size_bytes: 100 };
  const payload = { file_id: "notebook", request_id: id };
  let upstream = Response.json({ ...receipt, refresh_token: "private" }, { status: 201 });
  const harness = setup({ role: "student", upstream: async () => upstream });
  assert.equal((await harness.submissionRequest("POST", ["1"], { body: payload, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.submissionRequest("GET", ["1"], { headers: { cookie: "" } })).status, 401);
  assert.equal((await harness.submissionRequest("DELETE")).status, 405);
  assert.equal((await harness.submissionRequest("GET", ["5"])).status, 404);
  for (const body of [{ ...payload, student_id: 2 }, { ...payload, file_id: "../escape" }, { ...payload, request_id: "invalid" }, { file_id: "x".repeat(3000) }]) {
    assert.equal((await harness.submissionRequest("POST", ["1"], { body })).status, 422);
  }
  for (const query of ["?student_id=2", "?page=0", "?page=1&page=2", "?start=bad"]) assert.equal((await harness.submissionRequest("GET", ["1"], { query })).status, 422);
  assert.equal(harness.calls.length, 0);
  const saved = await harness.submissionRequest("POST", ["1"], { body: payload });
  assert.equal(saved.status, 201);
  assert.deepEqual(await saved.json(), receipt);
  assert.equal(saved.headers.get("cache-control"), "no-store");
  assert.equal(harness.calls[0][0], "http://127.0.0.1:8900/student/submissions/1");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  upstream = Response.json({ items: [{ ...receipt, notebook: "private" }], total: 1, page: 1, page_size: 10 });
  assert.deepEqual((await (await harness.submissionRequest("GET")).json()).items, [receipt]);
  upstream = new Response("notebook-bytes");
  const downloaded = await harness.submissionRequest("GET", ["1", id, "download"]);
  assert.equal(await downloaded.text(), "notebook-bytes");
  assert.equal(downloaded.headers.get("content-type"), "application/octet-stream");
  assert.match(downloaded.headers.get("content-disposition"), /attachment; filename="submission-/);
  assert.equal(downloaded.headers.get("content-security-policy"), "sandbox");
  for (const status of [401, 403, 409, 422, 500]) {
    upstream = Response.json({ detail: "private provider error" }, { status });
    const response = await harness.submissionRequest("POST", ["1"], { body: payload });
    assert.equal(response.status, status === 500 ? 503 : status);
    assert.doesNotMatch(await response.text(), /private/);
    assert.equal(response.headers.get("location"), null);
  }
  upstream = Response.json({ ...receipt, week: 2 });
  assert.equal((await harness.submissionRequest("POST", ["1"], { body: payload })).status, 503);
  upstream = new Response("x".repeat(2097153));
  assert.equal((await harness.submissionRequest("GET", ["1", id, "download"])).status, 503);
});

test("Google Drive proxy enforces origin, authentication and strict routes", async () => {
  const harness = setup({ role: "student" });
  assert.equal((await harness.driveRequest("GET", [], { headers: { cookie: "" } })).status, 401);
  assert.equal((await harness.driveRequest("POST", ["connect"], { headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.driveRequest("DELETE", [], { headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.driveRequest("GET", ["connect"])).status, 405);
  assert.equal((await harness.driveRequest("POST", ["callback"])).status, 405);
  assert.equal((await harness.driveRequest("GET", ["invalid"])).status, 404);
  assert.equal((await harness.driveRequest("GET", [], { query: "?student_id=2" })).status, 422);
  assert.equal(harness.calls.length, 0);
});

test("Google Picker credentials require same-origin POST and return only allowlisted fields", async () => {
  const credentials = { access_token: "temporary", expires_in: 3600, api_key: "picker-key", project_number: "123456" };
  const harness = setup({ role: "student", upstream: async () => Response.json({ ...credentials, refresh_token: "private" }) });
  assert.equal((await harness.driveRequest("GET", ["picker"])).status, 405);
  assert.equal((await harness.driveRequest("POST", ["picker"], { headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.driveRequest("POST", ["picker"], { headers: { cookie: "" } })).status, 401);
  assert.equal((await harness.driveRequest("POST", ["picker"], { query: "?student_id=2" })).status, 422);
  assert.equal(harness.calls.length, 0);
  const response = await harness.driveRequest("POST", ["picker"]);
  assert.deepEqual(await response.json(), credentials);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(harness.calls[0][0], "http://127.0.0.1:8900/student/google-drive/picker");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  for (const status of [401, 409, 500]) {
    const failed = await setup({ role: "student", upstream: async () => Response.json({ secret: "private" }, { status }) }).driveRequest("POST", ["picker"]);
    assert.equal(failed.status, status === 500 ? 503 : status);
    assert.equal(failed.headers.get("location"), null);
    assert.doesNotMatch(await failed.text(), /private/);
  }
  for (const upstream of [async () => { throw new Error("private"); }, async () => Response.json({ ...credentials, expires_in: -1 })]) {
    const failed = await setup({ role: "student", upstream }).driveRequest("POST", ["picker"]);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("location"), null);
    assert.doesNotMatch(await failed.text(), /private/);
  }
});

test("Google Drive start pins Google destination and sets private browser state", async () => {
  const state = "s".repeat(43);
  const authorization_url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    state, redirect_uri: `${origin}/api/student/google-drive/callback`, scope: "https://www.googleapis.com/auth/drive.file",
  });
  const harness = setup({ role: "student", env: { NODE_ENV: "production" }, upstream: async () => Response.json({ state, authorization_url }) });
  const response = await harness.driveRequest("POST", ["connect"]);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), authorization_url);
  for (const pattern of [/HttpOnly/i, /SameSite=lax/i, /Secure/i, /Max-Age=600/i, /Path=\/api\/student\/google-drive\/callback/]) assert.match(response.headers.get("set-cookie"), pattern);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(harness.calls[0][1].cache, "no-store");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  const invalid = setup({ role: "student", upstream: async () => Response.json({ state, authorization_url: "https://other.example" }) });
  assert.equal((await invalid.driveRequest("POST", ["connect"])).headers.get("location"), `${origin}/profile?google_drive=error`);
});

test("Google Drive callback validates cookie state and never returns code or tokens", async () => {
  const state = "s".repeat(43);
  const headers = { cookie: `applied_ai_student=${token}; applied_ai_google_state=${state}` };
  const harness = setup({ role: "student", upstream: async () => Response.json({ connected: true, refresh_token: "secret" }) });
  for (const query of [`?state=${state}&code=private`, `?state=${"x".repeat(43)}&code=private`]) {
    const response = await harness.driveRequest("GET", ["callback"], { query });
    assert.equal(response.headers.get("location"), `${origin}/profile?google_drive=expired`);
  }
  assert.equal(harness.calls.length, 0);
  const duplicate = await harness.driveRequest("GET", ["callback"], { headers, query: `?state=${state}&code=private&code=other` });
  assert.match(duplicate.headers.get("location"), /expired$/);
  const response = await harness.driveRequest("GET", ["callback"], { headers, query: `?state=${state}&code=private` });
  assert.equal(response.headers.get("location"), `${origin}/profile?google_drive=connected`);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(JSON.parse(harness.calls[0][1].body), { state, code: "private" });
  assert.doesNotMatch(await response.text(), /private|secret/);
  const denied = setup({ role: "student", upstream: async () => Response.json({ detail: "secret" }, { status: 400 }) });
  const denial = await denied.driveRequest("GET", ["callback"], { headers, query: `?state=${state}&error=access_denied` });
  assert.equal(denial.headers.get("location"), `${origin}/profile?google_drive=cancelled`);
});

test("Google Drive status and disconnect sanitize backend data and failures", async () => {
  const harness = setup({ role: "student", upstream: async () => Response.json({ connected: true, refresh_token: "secret" }) });
  assert.deepEqual(await (await harness.driveRequest("GET")).json(), { connected: true });
  for (const upstream of [async () => Response.json({ connected: "true", secret: "private" }), async () => Response.json({ detail: "private" }, { status: 500 })]) {
    const response = await setup({ role: "student", upstream }).driveRequest("GET");
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private/);
  }
  const removed = await setup({ role: "student" }).driveRequest("DELETE");
  assert.equal(removed.status, 204);
  assert.match(removed.headers.get("set-cookie"), /Max-Age=0/i);
});

test("programme server guard checks current access without caching and fails closed", async () => {
  const allowed = setup({ role: "student", cookie: token, upstream: async () => Response.json({ week: 2, is_open: true }) });
  await allowed.programme.requireOpenWeek(2);
  assert.equal(allowed.calls[0][0], "http://127.0.0.1:8900/student/programme/2");
  assert.equal(allowed.calls[0][1].cache, "no-store");
  assert.equal(allowed.calls[0][1].headers.Authorization, `Bearer ${token}`);
  for (const [status, expected] of [[401, /redirect:\/student\/login/], [403, /redirect:\/student\/programme/], [404, /not found/], [500, /temporarily unavailable/]]) {
    const guard = setup({ role: "student", cookie: token, upstream: async () => new Response(null, { status }) });
    await assert.rejects(guard.programme.requireOpenWeek(2), expected);
  }
  for (const body of [{ week: 2, is_open: false }, { week: 1, is_open: true }, {}]) {
    const guard = setup({ role: "student", cookie: token, upstream: async () => Response.json(body) });
    await assert.rejects(guard.programme.requireOpenWeek(2), /temporarily unavailable/);
  }
  const signedOut = setup({ role: "student" });
  await assert.rejects(signedOut.programme.requireOpenWeek(2), /redirect:\/student\/login/);
  assert.equal(signedOut.calls.length, 0);
});

test("programme lists validate four saved states for the correct audience", async () => {
  const weeks = [1, 2, 3, 4].map((week) => ({ week, is_open: week === 2 }));
  for (const role of ["admin", "student"]) {
    const harness = setup({ role, cookie: token, upstream: async () => Response.json(weeks) });
    assert.equal(JSON.stringify(await harness.programme.getProgrammeWeeks(role)), JSON.stringify(weeks));
    assert.equal(harness.calls[0][0], `http://127.0.0.1:8900/${role}/programme`);
    assert.equal(harness.calls[0][1].cache, "no-store");
    for (const invalid of [[], [{ week: 1, is_open: true }], weeks.map((item) => ({ ...item, is_open: "true" }))]) {
      const guard = setup({ role, cookie: token, upstream: async () => Response.json(invalid) });
      await assert.rejects(guard.programme.getProgrammeWeeks(role), /temporarily unavailable/);
    }
  }
});

for (const role of ["admin", "student"]) test(`${role} password change guards input and clears the cookie only after confirmed success`, async () => {
  const payload = { current_password: " current password ", new_password: "new password", confirm_password: "new password" };
  const harness = setup({ role });
  assert.equal((await harness.changePassword(payload, { origin: "https://foreign.example" })).status, 403);
  assert.equal((await harness.changePassword(payload, { cookie: "" })).status, 401);
  assert.equal((await harness.changePassword({ ...payload, current_password: "x".repeat(17000) })).status, 422);
  assert.equal(harness.calls.length, 0);
  const response = await harness.changePassword(payload);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie"), new RegExp(`applied_ai_${role}=;.*Max-Age=0`, "i"));
  assert.doesNotMatch(response.headers.get("set-cookie"), new RegExp(`applied_ai_${role === "student" ? "admin" : "student"}=`));
  assert.equal(harness.calls[0][0], `http://127.0.0.1:8900/${role === "student" ? "student/password" : "admin/settings/password"}`);
  assert.deepEqual(JSON.parse(harness.calls[0][1].body), payload);
  for (const status of [400, 401, 422, 429, 500]) {
    const failed = setup({ role, upstream: async () => Response.json({ detail: "private password" }, { status }) });
    const result = await failed.changePassword(payload);
    assert.equal(result.status, status === 500 ? 503 : status);
    assert.equal(result.headers.get("set-cookie"), null);
    assert.doesNotMatch(await result.text(), /private password/);
  }
});

test("login stores a secure private cookie, never a token in JSON", async () => {
  const harness = setup({ env: { NODE_ENV: "production" }, upstream: async () => Response.json({
    access_token: token, expires_at: new Date(Date.now() + 28_800_000).toISOString(),
  }) });
  const response = await harness.post("login", { email: " admin@example.com ", password: " padded password " });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\//i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(harness.calls[0][0], "http://127.0.0.1:8900/admin/login");
  assert.equal(harness.calls[0][1].cache, "no-store");
  assert.deepEqual(JSON.parse(harness.calls[0][1].body), { email: "admin@example.com", password: " padded password " });
});

test("student authentication uses isolated private cookies and protected sessions", async () => {
  const harness = setup({ role: "student", env: { NODE_ENV: "production" }, upstream: async () => Response.json({ access_token: token, expires_at: new Date(Date.now() + 28_800_000).toISOString() }) });
  const response = await harness.post("login", { email: " student@example.com ", password: " padded password " });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  for (const attribute of [/applied_ai_student=/i, /HttpOnly/i, /Secure/i, /SameSite=lax/i]) {
    assert.match(response.headers.get("set-cookie"), attribute);
  }
  assert.doesNotMatch(response.headers.get("set-cookie"), /applied_ai_admin/);
  assert.equal(harness.calls[0][0], "http://127.0.0.1:8900/student/login");
  assert.deepEqual(JSON.parse(harness.calls[0][1].body), { email: "student@example.com", password: " padded password " });
  const guard = setup({ role: "student" });
  assert.equal((await guard.post("login", {}, { origin: "https://foreign.example" })).status, 403);
  assert.equal((await guard.post("login", { email: "student@example.com", password: "x".repeat(9000) })).status, 422);
  assert.equal(guard.calls.length, 0);
  await assert.rejects(guard.session.requireStudent(), /redirect:\/student\/login/);
  assert.equal((await guard.post("logout", undefined, { cookie: `applied_ai_admin=${token}` })).status, 204);
  assert.equal(guard.calls.length, 0);
  const logout = await guard.post("logout", undefined, { cookie: `applied_ai_student=${token}` });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie"), /applied_ai_student=;.*Max-Age=0/i);
  assert.equal(guard.calls[0][0], "http://127.0.0.1:8900/student/logout");
  for (const status of [401, 422, 429, 500]) {
    const failed = setup({ role: "student", upstream: async () => Response.json({ detail: "private data" }, { status }) });
    const result = await failed.post("login", { email: "student@example.com", password: "password" });
    assert.equal(result.status, status === 500 ? 503 : status);
    assert.equal(result.headers.get("set-cookie"), null);
    assert.doesNotMatch(await result.text(), /private data/);
  }
});

test("foreign origins and invalid payloads never reach the backend", async () => {
  const harness = setup();
  for (const foreign of ["https://foreign.example", "null", "", "http://localhost:3301"]) {
    assert.equal((await harness.post("login", {}, { origin: foreign })).status, 403);
    assert.equal((await harness.post("logout", undefined, { origin: foreign })).status, 403);
  }
  for (const body of [{}, null, { email: 5, password: "secret" }, { email: "admin@example.com", password: "" }, { email: "admin@example.com", password: "x".repeat(9000) }]) {
    assert.equal((await harness.post("login", body)).status, 422);
  }
  assert.equal((await harness.post("login", {}, { "content-type": "text/plain" })).status, 422);
  assert.equal((await harness.post("signup", {})).status, 404);
  assert.equal(harness.calls.length, 0);
});

test("errors are sanitized and rate limits are preserved", async () => {
  for (const status of [401, 422, 429, 500]) {
    const harness = setup({ upstream: async () => Response.json({ detail: "private backend internals" }, { status }) });
    const response = await harness.post("login", { email: "admin@example.com", password: "secret" });
    assert.equal(response.status, status === 500 ? 503 : status);
    assert.doesNotMatch(await response.text(), /private backend internals|secret/);
    assert.equal(response.headers.get("set-cookie"), null);
    if (status === 429) assert.equal(response.headers.get("retry-after"), "60");
  }
  const unavailable = setup({ upstream: async () => { throw new Error("private host details"); } });
  assert.equal((await unavailable.post("login", { email: "admin@example.com", password: "secret" })).status, 503);
});

test("malformed or expired upstream sessions are rejected", async () => {
  for (const result of [{ access_token: "bad", expires_at: new Date(Date.now() + 60_000).toISOString() }, { access_token: token, expires_at: "invalid" }, { access_token: token, expires_at: new Date(0).toISOString() }]) {
    const harness = setup({ upstream: async () => Response.json(result) });
    const response = await harness.post("login", { email: "admin@example.com", password: "secret" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("logout revokes the bearer token and expires its cookie", async () => {
  const harness = setup();
  const response = await harness.post("logout", undefined, { cookie: `applied_ai_admin=${token}` });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/i);
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  const missing = setup();
  assert.equal((await missing.post("logout")).status, 204);
  assert.equal(missing.calls.length, 0);
  const expired = setup({ upstream: async () => new Response(null, { status: 401 }) });
  assert.equal((await expired.post("logout", undefined, { cookie: `applied_ai_admin=${token}` })).status, 204);
  const unavailable = setup({ upstream: async () => { throw new Error("offline"); } });
  const failure = await unavailable.post("logout", undefined, { cookie: `applied_ai_admin=${token}` });
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get("set-cookie"), null);
});

test("dashboard checks the current backend session before rendering", async () => {
  for (const cookie of [undefined, "invalid"]) {
    const harness = setup({ cookie });
    await assert.rejects(harness.session.requireAdmin(), /redirect:\/admin\/login/);
    assert.equal(harness.calls.length, 0);
  }
  for (const status of [401, 403]) {
    const harness = setup({ cookie: token, upstream: async () => new Response(null, { status }) });
    await assert.rejects(harness.session.requireAdmin(), /redirect:\/admin\/login/);
  }
  const account = { id: 1, email: "admin@example.com", is_active: true };
  const valid = setup({ cookie: token, upstream: async () => Response.json(account) });
  assert.deepEqual(await valid.session.requireAdmin(), account);
  assert.equal(valid.calls[0][1].headers.Authorization, `Bearer ${token}`);
  const unavailable = setup({ cookie: token, upstream: async () => new Response(null, { status: 503 }) });
  await assert.rejects(unavailable.session.requireAdmin(), /temporarily unavailable/);
});