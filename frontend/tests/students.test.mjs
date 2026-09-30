import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const origin = "http://localhost:3300";
const token = "a".repeat(43);

function setup(upstream = async () => Response.json({ id: 1 }), env = {}, resource = "students") {
  const calls = [];
  const route = resource === "settings/email" ? "settings/email/route.ts" : `${resource}/[[...path]]/route.ts`;
  const source = readFileSync(new URL(`../src/app/api/admin/${route}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, process: { env }, Buffer, URL, URLSearchParams,
    require: (name) => name === "@/lib/admin-session" ? {
      ADMIN_COOKIE: "applied_ai_admin", TOKEN_PATTERN: /^[A-Za-z0-9_-]{43}$/,
      adminRequest: async (...args) => { calls.push(args); return upstream(...args); },
    } : require(name),
  });
  function request(method, path = [], { body, query = "", cookie = token, headers = {} } = {}) {
    return exports[method](new NextRequest(`${origin}/api/admin/${resource}/${path.join("/")}${query}`, {
      method, headers: { origin, "content-type": "application/json", ...(cookie ? { cookie: `applied_ai_admin=${cookie}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { params: Promise.resolve({ path }) });
  }
  return { request, calls };
}

test("student proxy protects authentication, origin, methods and paths", async () => {
  const harness = setup();
  assert.equal((await harness.request("GET", [], { cookie: "" })).status, 401);
  assert.equal((await harness.request("POST", [], { body: {}, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.request("GET", ["..", "me"])).status, 404);
  assert.equal((await harness.request("GET", ["1", "password"])).status, 405);
  assert.equal((await harness.request("DELETE", [])).status, 405);
  assert.equal(harness.calls.length, 0);
});

test("student proxy bounds bodies and allowlists filters", async () => {
  const harness = setup();
  for (const body of [null, [], { password: "x".repeat(17000) }]) {
    assert.equal((await harness.request("POST", [], { body })).status, 422);
  }
  for (const query of ["?admin_id=2", "?page=1&page=2", "?search=" + "x".repeat(101)]) {
    assert.equal((await harness.request("GET", [], { query })).status, 422);
  }
  assert.equal(harness.calls.length, 0);
});

test("student proxy forwards token privately, collection slash, filters and password spaces", async () => {
  const harness = setup();
  const response = await harness.request("GET", [], { query: "?search=Test&page=2" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(harness.calls[0][0], "students/?search=Test&page=2");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(await response.text(), new RegExp(token));
  await harness.request("POST", ["1", "password"], { body: { password: " padded password " } });
  assert.equal(harness.calls[1][0], "students/1/password");
  assert.equal(JSON.parse(harness.calls[1][1].body).password, " padded password ");
  assert.equal((await setup(async () => new Response(null, { status: 204 })).request("DELETE", ["1"])).status, 204);
});

test("student proxy sanitizes upstream errors", async () => {
  for (const status of [401, 403, 404, 409, 422, 500]) {
    const harness = setup(async () => Response.json({ detail: "private password and database secret" }, { status }));
    const response = await harness.request("GET", ["1"]);
    assert.equal(response.status, status === 500 ? 503 : status === 403 ? 401 : status);
    assert.doesNotMatch(await response.text(), /private password|database secret/);
  }
});

test("invitation proxy only allows authenticated same-origin POST and preserves cooldown", async () => {
  const harness = setup(async () => Response.json({ id: 1, email_delivery: "accepted" }));
  assert.equal((await harness.request("GET", ["1", "invitation"])).status, 405);
  assert.equal((await harness.request("POST", ["1", "invitation"], { body: {}, cookie: "" })).status, 401);
  assert.equal((await harness.request("POST", ["1", "invitation"], { body: {}, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal(harness.calls.length, 0);
  const response = await harness.request("POST", ["1", "invitation"], { body: {} });
  assert.equal(response.status, 200);
  assert.equal(harness.calls[0][0], "students/1/invitation");
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const status of [409, 429, 503]) {
    const result = await setup(async () => Response.json({ detail: "secret" }, { status })).request("POST", ["1", "invitation"], { body: {} });
    assert.equal(result.status, status);
    assert.doesNotMatch(await result.text(), /secret/);
  }
});

test("invitation toolbar requires selection and setup screen initially checks the link", () => {
  const { StudentInvitations } = loadStudentComponents("components/student-invitations");
  const html = renderToStaticMarkup(React.createElement(StudentInvitations, { selected: [], clear() {}, disabled: false }));
  assert.match(html, /0 selected/);
  assert.match(html, /disabled/);
  assert.match(html, /Send invitations/);
  const { StudentSetupPassword } = loadStudentComponents("components/student-setup-password");
  const setupHtml = renderToStaticMarkup(React.createElement(StudentSetupPassword));
  assert.match(setupHtml, /Set up your password/);
  assert.match(setupHtml, /Checking invitation/);
  assert.doesNotMatch(setupHtml, /name="password"/);
});

test("faculty proxy enforces auth, origin, paths and filters and sanitizes failures", async () => {
  const harness = setup(undefined, {}, "faculty");
  assert.equal((await harness.request("GET", [], { cookie: "" })).status, 401);
  assert.equal((await harness.request("POST", [], { body: {}, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.request("GET", ["..", "me"])).status, 404);
  assert.equal((await harness.request("GET", ["1", "password"])).status, 405);
  assert.equal((await harness.request("DELETE", [])).status, 405);
  for (const body of [null, [], { password: "x".repeat(17000) }]) assert.equal((await harness.request("POST", [], { body })).status, 422);
  for (const query of ["?admin_id=2", "?page=1&page=2", "?search=" + "x".repeat(101)]) assert.equal((await harness.request("GET", [], { query })).status, 422);
  assert.equal(harness.calls.length, 0);
  for (const status of [401, 403, 404, 409, 422, 500]) {
    const response = await setup(async () => Response.json({ detail: "private database secret" }, { status }), {}, "faculty").request("GET", ["1"]);
    assert.equal(response.status, status === 500 ? 503 : status === 403 ? 401 : status);
    assert.doesNotMatch(await response.text(), /private database secret/);
  }
});

test("faculty proxy preserves role payloads, private tokens and collection slash", async () => {
  const harness = setup(undefined, {}, "faculty");
  const response = await harness.request("GET", [], { query: "?search=HOD&page=2" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(harness.calls[0][0], "faculty/?search=HOD&page=2");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(await response.text(), new RegExp(token));
  await harness.request("POST", [], { body: { name: "Faculty", role: "Asst. Professor", password: " padded password " } });
  assert.equal(harness.calls[1][0], "faculty/");
  assert.equal(JSON.parse(harness.calls[1][1].body).role, "Asst. Professor");
  await harness.request("POST", ["1", "password"], { body: { password: " padded password " } });
  assert.equal(harness.calls[2][0], "faculty/1/password");
  assert.equal(JSON.parse(harness.calls[2][1].body).password, " padded password ");
  assert.equal((await setup(async () => new Response(null, { status: 204 }), {}, "faculty").request("DELETE", ["1"])).status, 204);
});

test("email settings proxy rejects unauthorized, foreign-origin and oversized requests", async () => {
  const harness = setup(undefined, {}, "settings/email");
  assert.equal((await harness.request("GET", [], { cookie: "" })).status, 401);
  assert.equal((await harness.request("PUT", [], { body: {}, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.request("GET", [], { query: "?admin_id=2" })).status, 422);
  for (const body of [null, [], { send_mail_token: "x".repeat(17000) }]) assert.equal((await harness.request("PUT", [], { body })).status, 422);
  assert.equal(harness.calls.length, 0);
});

test("email settings proxy strips secrets and sanitizes failures", async () => {
  const payload = { from_name: "Applied AI", from_email: "sender@example.com", send_mail_token: "private-mail-token" };
  const harness = setup(async () => Response.json({ ...payload, token_configured: true, token_encrypted: "ciphertext" }), {}, "settings/email");
  const response = await harness.request("PUT", [], { body: payload });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { from_name: "Applied AI", from_email: "sender@example.com", token_configured: true });
  assert.equal(harness.calls[0][0], "settings/email");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
  assert.equal(JSON.parse(harness.calls[0][1].body).send_mail_token, payload.send_mail_token);
  for (const status of [401, 403, 422, 500]) {
    const result = await setup(async () => Response.json({ detail: "private-mail-token" }, { status }), {}, "settings/email").request("GET");
    assert.equal(result.status, status === 500 ? 503 : status === 403 ? 401 : status);
    assert.doesNotMatch(await result.text(), /private-mail-token/);
  }
});

test("email settings form masks token and preserves saved-token state", () => {
  const { EmailSettingsForm } = loadStudentComponents("components/email-settings");
  for (const configured of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(EmailSettingsForm, { initial: { from_name: "Applied AI", from_email: "sender@example.com", token_configured: configured } }));
    for (const name of ["from_name", "from_email", "send_mail_token"]) assert.match(html, new RegExp(`name="${name}"`));
    const input = html.match(/<input[^>]*name="send_mail_token"[^>]*>/)[0];
    assert.match(input, /type="password"/);
    assert.doesNotMatch(input, /value="[^\"]+"/);
    assert.equal(input.includes('required=""'), !configured);
    assert.equal(html.includes("Token saved"), configured);
  }
});

test("account confirmation distinguishes acceptance, missing settings and failures", () => {
  const { AccountCreated } = loadStudentComponents("components/account-created");
  for (const resource of ["students", "faculty"]) {
    for (const [status, text] of [["accepted", "Credentials email submitted successfully to ZeptoMail"], ["not_configured", "was not sent"], ["failed", "do not create it again"]]) {
      const html = renderToStaticMarkup(React.createElement(AccountCreated, { resource, account: { id: 1, email_delivery: status } }));
      assert.match(html, /account created/);
      assert.ok(html.includes(text));
      assert.doesNotMatch(html, /<form|type="password"/);
    }
  }
});

function loadStudentComponents(root = "components/students", overrides = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const base = new URL(`../src/${relative}`, import.meta.url);
    const path = [new URL(base.href + ".tsx"), new URL(base.href + ".ts")].find(existsSync);
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    cache.set(relative, exports);
    vm.runInNewContext(outputText, {
      exports, URL, URLSearchParams, FormData, AbortController, Intl, ...globals,
      require: (name) => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith("@/")) return load(name.slice(2));
        if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
        if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => {
          const anchorProps = { ...props };
          delete anchorProps.prefetch;
          return React.createElement("a", anchorProps, children);
        } };
        return require(name);
      },
    });
    return exports;
  }
  return load(root);
}

function componentHarness(root, exportName, overrides = {}, initial = []) {
  const slots = [...initial];
  let cursor = 0;
  const hooks = { ...React, useEffect() {}, useState(initialValue) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initialValue;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  }, useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; } };
  const component = loadStudentComponents(root, { ...overrides, react: hooks })[exportName];
  function render(props = {}) {
    cursor = 0;
    const nodes = [];
    function visit(node) {
      if (!React.isValidElement(node)) return;
      nodes.push(node);
      React.Children.forEach(node.props.children, visit);
    }
    visit(component(props));
    return nodes;
  }
  return { render, slots };
}

test("faculty monitoring renders loading, review states and preserves work controls on refresh", () => {
  const { FacultyStudents, WorkStatus } = loadStudentComponents("components/faculty-monitoring");
  const html = renderToStaticMarkup(React.createElement(FacultyStudents));
  for (const label of ["Search students", "From (IST)", "To (IST)", "Loading student records"]) assert.ok(html.includes(label));
  assert.match(renderToStaticMarkup(React.createElement(WorkStatus)), /Not submitted/);
  assert.match(renderToStaticMarkup(React.createElement(WorkStatus, { receipt: {} })), /Awaiting review/);
  assert.match(renderToStaticMarkup(React.createElement(WorkStatus, { receipt: { review: { score: 85 } } })), /85\/100/);
  const student = { name: "Student", student_id: "ST-1", created_at: "2026-09-30T10:00:00Z", submissions: [] };
  const harness = componentHarness("components/faculty-monitoring", "FacultyStudent", {}, [0, { path: "/1", revision: 0, data: student }]);
  const before = harness.render({ id: "1" });
  const work = before.find(node => node.props.id === "1" && typeof node.props.refresh === "function");
  assert.ok(work);
  before.find(node => node.props["aria-label"] === "Refresh student").props.onClick();
  const after = harness.render({ id: "1" });
  assert.equal(after.find(node => node.type === work.type).props.revision, 1);
  const login = loadStudentComponents("components/student-login").StudentLogin;
  assert.match(renderToStaticMarkup(React.createElement(login, { portal: "faculty" })), /Faculty portal/);
  assert.match(renderToStaticMarkup(React.createElement(login)), /Student portal/);
});

test("student selection retains pages and selects only inactive matching records", async () => {
  const first = { id: 1, name: "One", email: "one@example.com", is_active: false };
  const active = { id: 2, name: "Active", is_active: true };
  const second = { id: 3, name: "Three", is_active: false };
  const page = { items: [first, active], page: 1, page_size: 2, total: 3 };
  const calls = [];
  const harness = componentHarness("components/students", "StudentList", {
    "@/lib/students": { studentDate: () => "date", studentRequest: async (path) => {
      calls.push(path);
      return { items: [first, active, second], page: 1, page_size: 100, total: 3 };
    } },
  }, ["page=1&page_size=20", 0, page, false, "", new Map(), false]);
  let nodes = harness.render();
  assert.equal(nodes.find(node => node.props["aria-label"] === "Select Active").props.disabled, true);
  nodes.find(node => node.props["aria-label"] === "Select inactive students on this page").props.onCheckedChange(true);
  assert.deepEqual([...harness.slots[5].keys()], [1]);
  nodes.find(node => node.props["aria-label"] === "Next page").props.onClick();
  assert.deepEqual([...harness.slots[5].keys()], [1]);
  harness.slots[2] = { ...page, items: [second], page: 2 };
  harness.slots[3] = false;
  nodes = harness.render();
  nodes.find(node => node.props["aria-label"] === "Select Three").props.onCheckedChange(true);
  assert.deepEqual([...harness.slots[5].keys()], [1, 3]);
  await nodes.find(node => Array.isArray(node.props.children) && node.props.children.includes("Select all matching inactive")).props.onClick();
  assert.deepEqual([...harness.slots[5].keys()], [1, 3]);
  assert.match(calls[0], /page_size=100/);
  harness.render().find(node => node.props["aria-label"] === "Clear filters").props.onClick();
  assert.equal(harness.slots[5].size, 0);
});

test("bulk invitations require confirmation and continue after a failed recipient", async () => {
  const calls = [];
  const selected = [1, 2, 3].map(id => ({ id, name: `Student ${id}`, email: `student${id}@example.com` }));
  const harness = componentHarness("components/student-invitations", "StudentInvitations", {
    "@/lib/students": { studentRequest: async (path) => {
      calls.push(path);
      if (path.startsWith("2/")) throw new Error("Provider unavailable");
      return { email_delivery: "accepted" };
    } },
  });
  const props = { selected, clear() {}, disabled: false };
  harness.render(props).find(node => Array.isArray(node.props.children) && node.props.children.includes("Send invitations")).props.onClick();
  assert.equal(calls.length, 0);
  const confirm = harness.render(props).find(node => Array.isArray(node.props.children) && node.props.children.includes("Send "));
  await confirm.props.onClick();
  assert.deepEqual(calls, ["1/invitation", "2/invitation", "3/invitation"]);
  assert.deepEqual(Array.from(harness.slots[3], outcome => outcome.accepted), [true, false, true]);
  assert.equal(harness.slots[2], false);
  assert.equal(harness.render(props).some(node => Array.isArray(node.props.children) && node.props.children.includes("Send ")), false);
});

test("week one practice opens at midnight October 2 IST, never before", () => {
  const { weekOnePracticeOpen } = loadStudentComponents("lib/week-one", { "server-only": {} });
  assert.equal(weekOnePracticeOpen(Date.parse("2026-09-30T12:00:00+05:30")), false);
  assert.equal(weekOnePracticeOpen(Date.parse("2026-10-01T18:29:59.999Z")), false);
  assert.equal(weekOnePracticeOpen(Date.parse("2026-10-01T18:30:00.000Z")), true);
  assert.equal(weekOnePracticeOpen(Date.parse("2026-10-02T12:00:00+05:30")), true);
  assert.equal(weekOnePracticeOpen(NaN), false);
});

test("Wednesday and Friday handbooks split lessons and keep Friday server-gated", () => {
  for (const released of [false, true]) {
    const materials = loadStudentComponents("components/week-one-materials", {
      "server-only": {}, "@/lib/week-one": { weekOnePracticeOpen: () => released },
    });
    const wednesday = renderToStaticMarkup(React.createElement(materials.WeekOneHandbook));
    const friday = renderToStaticMarkup(React.createElement(materials.WeekOneHandbook, { day: "friday" }));
    const homework = renderToStaticMarkup(React.createElement(materials.WeekOneHomework));
    const fridayIds = ["reshaping", "broadcasting", "matrix-product", "prediction-loss", "autograd", "training"];
    const introductionIds = ["meet-pytorch", "why-learning", "inside-pytorch", "tensor-picture", "onboarding", "temperature-examples", "wednesday-recap"];
    assert.equal(materials.handbookLessons.length, 12);
    for (const lesson of materials.handbookLessons) {
      assert.ok(!wednesday.includes(`id="${lesson.id}"`));
      assert.equal(friday.includes(`id="${lesson.id}"`), released && fridayIds.includes(lesson.id));
      assert.equal(homework.includes(`id="${lesson.id}"`), released && fridayIds.includes(lesson.id));
      for (const example of lesson.examples) assert.ok(!wednesday.includes(example.title));
    }
    for (const id of introductionIds) assert.match(wednesday, new RegExp(`id="${id}"`));
    assert.ok(wednesday.indexOf('id="meet-pytorch"') < wednesday.indexOf('id="tensor-picture"'));
    assert.ok(wednesday.indexOf('id="tensor-picture"') < wednesday.indexOf('id="onboarding"'));
    assert.ok(wednesday.indexOf('id="onboarding"') < wednesday.indexOf('id="temperature-examples"'));
    assert.equal([...wednesday.matchAll(/aria-label="[^"]+: Python code"/g)].length, 3);
    assert.equal([...wednesday.matchAll(/What each line means/g)].length, 3);
    for (const id of ["why-learning", "inside-pytorch", "tensor-picture"]) assert.match(wednesday, new RegExp(`aria-labelledby="${id}-diagram-title"`));
    for (const output of ["tensor([20., 25., 30.])", "tensor([22., 27., 32.])", "tensor(27.)\n27.0"]) assert.ok(wednesday.includes(output));
    for (const concept of ["open-source framework", "2017", "C++", "Inference", "shape (2, 3)", "no Wednesday submission"]) assert.ok(wednesday.includes(concept));
    assert.match(wednesday, /Wednesday recap:/);
    assert.doesNotMatch(wednesday, /loss\.backward|optimizer\.step|torch\.manual_seed|torch\.cuda|\.tolist\(|\.numel\(|\.to\(|training-diagram-title|broadcast-diagram-title|reshape-diagram-title|Quick reference operations/);
    assert.equal(homework.includes("Classroom exercises"), released);
    assert.equal(homework.includes("Independent homework: calibrate a sensor"), released);
    assert.equal(homework.includes("Friday handbook, exercises and homework are locked"), !released);
    if (!released) {
      for (const locked of [friday, homework]) assert.doesNotMatch(locked, /<code|Handbook contents|50 epochs|0\.01|reference targets|Classroom exercises|diagram-title/);
      continue;
    }
    assert.ok(homework.indexOf('id="training"') < homework.indexOf("Classroom exercises"));
    assert.match(friday, /Friday recap:/);
    assert.doesNotMatch(friday, /id="onboarding"|Wednesday recap:/);
    const handbook = wednesday + friday;
    assert.match(handbook, /hljs-keyword/);
    assert.match(handbook, /hljs-string/);
    assert.match(handbook, /hljs-number/);
    assert.match(handbook, /Key takeaway/);
    for (const [lesson, diagram] of [["reshaping", "reshape"], ["broadcasting", "broadcast"], ["training", "training"]]) {
      const section = handbook.match(new RegExp(`<section id="${lesson}"[^>]*>([\\s\\S]*?)</section>`))?.[1];
      assert.ok(section?.includes(`aria-labelledby="${diagram}-diagram-title"`), `${diagram} diagram belongs to its lesson`);
    }
    const trainingSteps = handbook.match(/<ol aria-label="Training loop steps"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
    assert.equal([...trainingSteps.matchAll(/<li\b/g)].length, 5);
    assert.ok(trainingSteps.indexOf("zero_grad") < trainingSteps.indexOf("backward"));
    assert.ok(trainingSteps.indexOf("backward") < trainingSteps.indexOf("optimizer.step"));
    const operations = friday.match(/<dl aria-label="Quick reference operations"[^>]*>([\s\S]*?)<\/dl>/)?.[1];
    const references = friday.match(/<ul aria-label="Official references"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
    assert.equal([...operations.matchAll(/<code>/g)].length, 6);
    assert.equal([...references.matchAll(/target="_blank" rel="noreferrer"/g)].length, 2);
    assert.equal([...friday.match(/<dl aria-label="Glossary terms"[^>]*>([\s\S]*?)<\/dl>/)[1].matchAll(/<dt\b/g)].length, 10);
    const highlightedCells = [...handbook.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map(([, code]) => code.replace(/<[^>]*>/g, ""));
    for (const lesson of materials.handbookLessons.filter(lesson => fridayIds.includes(lesson.id))) {
      for (const example of lesson.examples) {
        const escaped = renderToStaticMarkup(React.createElement("code", null, example.code)).replace(/^<code>|<\/code>$/g, "");
        assert.ok(highlightedCells.includes(escaped), `Highlighting must preserve code: ${example.title}`);
      }
    }
    const contentsMenus = [...handbook.matchAll(/<nav aria-label="Handbook contents"[^>]*>([\s\S]*?)<\/nav>/g)];
    assert.equal(contentsMenus.length, 4);
    for (const [index, [, menu]] of contentsMenus.entries()) {
      const expectedGroups = index < 2 ? ["Today&#x27;s introduction", "Finish here"] : ["Tensor essentials", "Learning with PyTorch", "Reference"];
      for (const group of expectedGroups) assert.ok(menu.includes(`aria-label="${group}"`));
      const anchors = [...menu.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);
      assert.equal(anchors.length, index < 2 ? 7 : 8);
      assert.equal(new Set(anchors).size, anchors.length);
      for (const id of anchors) assert.ok((index < 2 ? wednesday : friday).includes(`id="${id}"`));
    }
    for (const label of ["Set up a notebook in Colab", "How is PyTorch built?", "Broadcasting", "autograd", "complete guided calibration", "Troubleshooting", "Glossary", "Expected output"]) assert.ok(handbook.includes(label), label);
    for (const lesson of materials.handbookLessons.filter(lesson => fridayIds.includes(lesson.id))) {
      assert.ok(lesson.paragraphs.length >= 2 && lesson.remember.length > 20);
      assert.match(handbook, new RegExp(`id="${lesson.id}"`));
      assert.match(handbook, new RegExp(`href="#${lesson.id}"`));
      for (const example of lesson.examples) assert.ok(example.code && example.output && example.explanation.length);
    }
    assert.doesNotMatch(handbook, /50 epochs|Independent homework: calibrate a sensor/);
  }
});

test("week submission surface starts disabled and includes dated history", () => {
  const { NotebookSubmissions } = loadStudentComponents("components/notebook-submissions");
  const html = renderToStaticMarkup(React.createElement(NotebookSubmissions, { week: 1 }));
  for (const label of ["Submission history", "From (IST)", "To (IST)", "Submit notebook", "2 MiB maximum", "Loading submissions"]) assert.ok(html.includes(label));
  assert.match(html, /<button[^>]*disabled[^>]*>[\s\S]*?Submit notebook/);
  assert.doesNotMatch(html, /<iframe|<script|dangerouslySetInnerHTML/);
});

test("submission history hides old filters immediately and ignores late responses", async () => {
  const slots = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
  let pendingEffects = [];
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effects[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const { NotebookSubmissions } = loadStudentComponents("components/notebook-submissions", {
    react: hooks, "@/components/google-drive-connection": { GoogleDriveConnection: () => null },
  }, { AbortSignal, fetch: (url, options) => new Promise(resolve => { requests.push({ url, options, resolve }); }) });
  function render() {
    cursor = 0;
    pendingEffects = [];
    const nodes = [];
    function visit(node) {
      if (!React.isValidElement(node)) return;
      nodes.push(node);
      React.Children.forEach(node.props.children, visit);
    }
    visit(NotebookSubmissions({ week: 1 }));
    return nodes;
  }
  const flushEffects = () => pendingEffects.forEach(callback => callback());
  const loading = nodes => nodes.some(node => node.props["aria-label"] === "Loading submissions");
  const finish = async (index, total) => {
    requests[index].resolve(Response.json({ items: [], total, page: 1, page_size: 10 }));
    await new Promise(resolve => setImmediate(resolve));
  };
  assert.equal(loading(render()), true);
  flushEffects();
  await finish(0, 11);
  let nodes = render();
  assert.equal(loading(nodes), false);
  assert.ok(nodes.some(node => node.props["aria-label"] === "Next page"));
  nodes.find(node => node.props.id === "submission-start").props.onChange({ target: { value: "2026-09-30" } });
  nodes = render();
  assert.equal(loading(nodes), true);
  assert.equal(nodes.some(node => node.props["aria-label"] === "Next page"), false);
  flushEffects();
  assert.match(requests[1].url, /start=2026-09-30/);
  nodes.find(node => node.props.children === "Practical").props.onClick();
  assert.equal(loading(render()), true);
  flushEffects();
  assert.equal(requests[1].options.signal.aborted, true);
  assert.match(requests[2].url, /kind=practical/);
  await finish(2, 0);
  await finish(1, 99);
  nodes = render();
  assert.equal(loading(nodes), false);
  assert.equal(nodes.some(node => node.props["aria-label"] === "Next page"), false);
  assert.ok(nodes.some(node => node.props.children === "No submissions yet."));
  nodes.find(node => node.props["aria-label"] === "Refresh submissions").props.onClick();
  assert.equal(loading(render()), true);
  flushEffects();
  await finish(3, 0);
  assert.equal(loading(render()), false);
  for (const effect of effects) effect?.cleanup?.();
});

test("submission retries retain request ID and saved receipt prevents duplicate clicks", async () => {
  const state = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const requests = [];
  let fail = true;
  const id = "31a4f0ee-6bda-4f70-928e-34b980d41756";
  const saved = { id, week: 1, filename: "Homework.ipynb", sha256: "a".repeat(64), submitted_at: "2026-09-30T10:00:00Z", size_bytes: 100 };
  const mockReact = { ...React, useEffect() {}, useState(initial) {
    const index = stateIndex++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  }, useRef(initial) { return refs[refIndex++] ||= { current: initial }; } };
  const source = readFileSync(new URL("../src/components/notebook-submissions.tsx", import.meta.url), "utf8");
  const exports = {};
  const picker = () => null;
  const button = () => null;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Intl, URLSearchParams, AbortController, AbortSignal, crypto: { randomUUID: () => id },
    fetch: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); if (fail) throw new TypeError("network"); return Response.json(saved); },
    require(name) {
      if (name === "react") return mockReact;
      if (name === "@/components/google-drive-connection") return { GoogleDriveConnection: picker };
      if (name === "@/components/ui/button") return { Button: button };
      if (name === "@/lib/submissions") return { parseReceipt: value => value };
      if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => key });
      return require(name);
    },
  });
  function render() { stateIndex = 0; refIndex = 0; return exports.NotebookSubmissions({ week: 1 }); }
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  let tree = render();
  find(tree, node => node.type === picker).props.onNotebookChange({ id: "file", name: "Homework.ipynb" });
  tree = render();
  let submit = find(tree, node => node.type === button && node.props.children?.includes?.("Submit notebook"));
  assert.equal(submit.props.disabled, false);
  await submit.props.onClick();
  tree = render();
  fail = false;
  submit = find(tree, node => node.type === button && node.props.children?.includes?.("Submit notebook"));
  await submit.props.onClick();
  assert.equal(requests.length, 2);
  assert.equal(JSON.stringify(requests[0].body), JSON.stringify(requests[1].body));
  assert.equal(requests[0].url, "/api/student/submissions/1");
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["file_id", "kind", "request_id"]);
  assert.equal(requests[0].body.kind, "homework");
  tree = render();
  assert.equal(find(tree, node => node.type === picker).props.submitted, true);
  submit = find(tree, node => node.type === button && node.props.children?.includes?.("Submitted"));
  assert.equal(submit.props.disabled, true);
  await submit.props.onClick();
  assert.equal(requests.length, 2);
});

test("student dashboard renders authenticated account data and programme navigation", async () => {
  let checks = 0;
  const { default: Dashboard } = loadStudentComponents("app/(student-portal)/dashboard/page", {
    "@/lib/student-session": { requireStudent: async () => {
      checks += 1;
      return { name: "Student Test", student_id: "ST-001", email: "student@example.com", college: "Test College", degree: "Civil Engineering", year: 3 };
    } },
  });
  const html = renderToStaticMarkup(await Dashboard());
  assert.equal(checks, 1);
  for (const value of ["Student Test", "student@example.com", "Test College", "Civil Engineering"]) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /Student overview|Student ID|Academic year|Account status|ST-001|Year 3/);
  const overview = html.match(/<section aria-label="Programme overview"[\s\S]*?<\/section>/)?.[0];
  assert.ok(overview);
  for (const value of ["Programme name", "Applied AI", "Duration", "4 weeks", "Topics", "PyTorch", "Transformer", "Hugging Face"]) assert.ok(overview.includes(value));
  assert.equal((overview.match(/data-slot="card"/g) || []).length, 3);
  assert.equal((overview.match(/data-slot="card-action"/g) || []).length, 3);
  assert.equal((overview.match(/data-slot="card-footer"/g) || []).length, 2);
  assert.equal((overview.match(/data-slot="badge"/g) || []).length, 1);
  for (const week of [1, 2, 3, 4]) assert.ok(overview.includes(`Week ${week}`));
  assert.match(html, /href="\/student\/programme"/);
  assert.doesNotMatch(html, /password_hash|attendance|completed lessons/i);
});

test("programme page checks student access and renders programme and four week cards", async () => {
  let checks = 0;
  const { default: Programme } = loadStudentComponents("app/(student-portal)/student/programme/page", {
    "@/lib/student-session": { requireStudent: async () => { checks += 1; } },
    "@/lib/programme": { getProgrammeWeeks: async () => [1, 2, 3, 4].map((week) => ({ week, is_open: false })) },
  });
  const html = renderToStaticMarkup(await Programme());
  assert.equal(checks, 1);
  for (const value of ["Applied AI", "4 weeks", "PyTorch", "Transformer", "Hugging Face", "Weekly outline"]) assert.ok(html.includes(value));
  assert.equal((html.match(/data-slot="card"/g) || []).length, 5);
  for (const week of [1, 2, 3, 4]) assert.match(html, new RegExp(`<h3[^>]*id="week-${week}"[^>]*>Week ${week}</h3>`));
  assert.equal((html.match(/>Locked</g) || []).length, 4);
  assert.match(html, /alt="AI lettering surrounded by interconnected digital pathways"/);
  assert.match(html, /images\.unsplash\.com\/photo-1677442136019-21780ecad995/);
  assert.match(html, /grid-cols-2 items-stretch gap-3 lg:grid-cols-4/);
  assert.doesNotMatch(html, /min-h-32|text-4xl/);
  assert.doesNotMatch(html, /href=|<button|completed lessons/i);
});

test("programme links only unlocked weeks and protects direct week pages", async () => {
  const { default: Programme } = loadStudentComponents("app/(student-portal)/student/programme/page", {
    "@/lib/student-session": { requireStudent: async () => {} },
    "@/lib/programme": { getProgrammeWeeks: async () => [1, 2, 3, 4].map((week) => ({ week, is_open: week === 2 })) },
  });
  const html = renderToStaticMarkup(await Programme());
  assert.match(html, /href="\/student\/programme\/2"/);
  assert.doesNotMatch(html, /href="\/student\/programme\/[134]"/);
  let checkedWeek;
  const { default: WeekPage } = loadStudentComponents("app/(student-portal)/student/programme/[week]/page", {
    "server-only": {},
    "@/lib/student-session": { requireStudent: async () => {} },
    "@/lib/programme": { requireOpenWeek: async (week) => { checkedWeek = week; if (week !== 2) throw new Error("locked"); } },
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
  });
  assert.match(renderToStaticMarkup(await WeekPage({ params: Promise.resolve({ week: "2" }) })), /Content coming soon/);
  assert.equal(checkedWeek, 2);
  await assert.rejects(() => WeekPage({ params: Promise.resolve({ week: "1" }) }), /locked/);
  await assert.rejects(() => WeekPage({ params: Promise.resolve({ week: "5" }) }), /not found/);
});

test("week views protect direct homework links and keep submissions separate", async () => {
  const { weekOnePracticeOpen } = loadStudentComponents("lib/week-one", { "server-only": {} });
  for (const [instant, released] of [["2026-10-01T18:29:59.999Z", false], ["2026-10-01T18:30:00Z", true]]) {
    const guards = [];
    const { default: WeekPage } = loadStudentComponents("app/(student-portal)/student/programme/[week]/page", {
      "server-only": {},
      "@/lib/student-session": { requireStudent: async () => { guards.push("student"); } },
      "@/lib/programme": { requireOpenWeek: async week => { guards.push(week); } },
      "@/lib/week-one": { weekOnePracticeOpen: () => weekOnePracticeOpen(Date.parse(instant)) },
    });
    const renderView = async (tab, week = "1") => renderToStaticMarkup(await WeekPage({ params: Promise.resolve({ week }), searchParams: Promise.resolve({ tab }) }));
    const homework = await renderView("homework");
    assert.deepEqual(guards, ["student", 1]);
    assert.match(homework, /href="\/student\/programme\/1\?tab=homework" aria-current="page"/);
    assert.equal(homework.includes("Independent homework: calibrate a sensor"), released);
    assert.equal(homework.includes("Friday handbook, exercises and homework are locked"), !released);
    assert.equal(homework.includes('id="training"'), released);
    assert.equal(homework.includes("Friday handbook, exercises and homework open on October 2 at 12:00 AM IST."), !released);
    const navigation = homework.match(/<nav aria-label="Week views"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(navigation);
    for (const [tab, day, label] of [["handbook", "Wednesday, Sep 30", "Handbook"], ["homework", "Friday, Oct 2", "Handbook &amp; Exercises"]]) {
      const link = navigation.match(new RegExp(`<a href="/student/programme/1\\?tab=${tab}"[^>]*>([\\s\\S]*?)</a>`))?.[1];
      assert.ok(link?.includes(day));
      assert.ok(link?.includes(label));
    }
    const handbook = await renderView("handbook");
    assert.match(handbook, /Getting started with PyTorch/);
    assert.doesNotMatch(handbook, /Submission history|id="training"|id="reshaping"|loss\.backward/);
    const submission = await renderView("submission");
    assert.match(submission, /Submission history/);
    assert.doesNotMatch(submission, /id="handbook-title"/);
    for (const invalid of [undefined, "unknown", ["homework", "handbook"]]) {
      const overview = await renderView(invalid);
      assert.match(overview, /Wednesday learning outcomes/);
      for (const label of ["Overview", "Handbook", "Exercises", "Submission"]) assert.ok(overview.includes(label));
    }
    for (const week of ["2", "3", "4"]) for (const tab of ["overview", "handbook", "homework"]) {
      const unpublished = await renderView(tab, week);
      assert.match(unpublished, /Content coming soon/);
      assert.doesNotMatch(unpublished, /id="handbook-title"|Classroom exercises/);
      assert.doesNotMatch(unpublished, /Wednesday, Sep 30|Friday, Oct 2|Friday handbook, exercises and homework open/);
    }
  }
});

test("legacy programme routes redirect to the student namespace", async () => {
  const overrides = { "next/navigation": {
    redirect: (path) => { throw new Error(`redirect:${path}`); },
    notFound: () => { throw new Error("not found"); },
  } };
  const { default: ProgrammeRedirect } = loadStudentComponents("app/(student-portal)/programme/page", overrides);
  assert.throws(() => ProgrammeRedirect(), /redirect:\/student\/programme$/);
  const { default: WeekRedirect } = loadStudentComponents("app/(student-portal)/programme/[week]/page", overrides);
  for (const week of ["1", "2", "3", "4"]) {
    await assert.rejects(() => WeekRedirect({ params: Promise.resolve({ week }) }), new RegExp(`redirect:/student/programme/${week}$`));
  }
  await assert.rejects(() => WeekRedirect({ params: Promise.resolve({ week: "5" }) }), /not found/);
});

test("programme admin renders four saved access controls", () => {
  const { ProgrammeControls } = loadStudentComponents("components/programme-controls");
  const html = renderToStaticMarkup(React.createElement(ProgrammeControls, { initial: [1, 2, 3, 4].map((week) => ({ week, is_open: week === 2 })) }));
  assert.equal((html.match(/role="checkbox"/g) || []).length, 4);
  for (const week of [1, 2, 3, 4]) assert.ok(html.includes(`Unlock Week ${week}`));
  assert.equal((html.match(/Open to students/g) || []).length, 1);
  assert.equal((html.match(/>Locked</g) || []).length, 3);
});

test("programme proxy protects mutations and returns only saved access", async () => {
  const harness = setup(async () => Response.json({ week: 2, is_open: true, secret: "hidden" }), {}, "programme");
  assert.equal((await harness.request("GET", [], { cookie: "" })).status, 401);
  assert.equal((await harness.request("PUT", ["2"], { body: { is_open: true }, headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await harness.request("PUT", ["5"], { body: { is_open: true } })).status, 404);
  assert.equal((await harness.request("PUT", [], { body: { is_open: true } })).status, 405);
  for (const body of [null, [], { is_open: "true" }, { is_open: true, admin_id: 2 }, { is_open: "x".repeat(1025) }]) {
    assert.equal((await harness.request("PUT", ["2"], { body })).status, 422);
  }
  assert.equal(harness.calls.length, 0);
  const response = await harness.request("PUT", ["2"], { body: { is_open: true } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { week: 2, is_open: true });
  assert.equal(harness.calls[0][0], "programme/2");
  assert.equal(harness.calls[0][1].headers.Authorization, `Bearer ${token}`);
});

test("student profile checks access and renders account details and password fields", async () => {
  let checks = 0;
  const { default: Profile } = loadStudentComponents("app/(student-portal)/profile/page", {
    "@/lib/student-session": { requireStudent: async () => {
      checks += 1;
      return { name: "Student Test", student_id: "ST-001", email: "student@example.com", college: "Test College", degree: "Civil Engineering", year: 3 };
    } },
  });
  const html = renderToStaticMarkup(await Profile());
  assert.equal(checks, 1);
  for (const value of ["Student Test", "ST-001", "student@example.com", "Test College", "Civil Engineering", "Year 3"]) assert.ok(html.includes(value));
  for (const field of ["current_password", "new_password", "confirm_password"]) assert.match(html, new RegExp(`name="${field}"`));
  assert.equal((html.match(/type="password"/g) || []).length, 3);
  assert.doesNotMatch(html, /password_hash/);
});

test("student shell uses compact icon collapse and marks each active route", () => {
  for (const pathname of ["/dashboard", "/student/programme", "/student/programme/1", "/profile"]) {
    const { StudentShell } = loadStudentComponents("components/student-shell", {
      "next/navigation": { usePathname: () => pathname, useRouter: () => ({ refresh() {} }) },
      "@/components/brand-logo": { BrandLogo: () => React.createElement("img", { alt: "Zyora Labs" }) },
    });
    const html = renderToStaticMarkup(React.createElement(StudentShell, { name: "Student Test", studentId: "ST-001" }, "Page content"));
    assert.match(html, /--sidebar-width:13rem/);
    assert.match(html, /--sidebar-width-icon:3.5rem/);
    assert.match(html, /title="Toggle sidebar"/);
    const logo = html.indexOf('alt="Zyora Labs"');
    const footer = html.indexOf('data-slot="sidebar-footer"');
    const toggle = html.indexOf('title="Toggle sidebar"');
    const signout = html.indexOf('title="Sign out"');
    const header = html.indexOf("<header");
    assert.ok(logo >= 0 && logo < html.indexOf('data-slot="sidebar-content"'));
    assert.ok(footer > logo && toggle > footer && signout > toggle && signout < header);
    assert.doesNotMatch(html.slice(header), /title="Sign out"|title="Toggle sidebar"/);
    assert.match(html, /title="Open navigation"/);
    const headerHtml = html.slice(header);
    assert.match(headerHtml, /IST/);
    assert.match(headerHtml, /--:--:-- --/);
    assert.match(headerHtml, /aria-label="Notifications"/);
    const supportLink = headerHtml.match(/<a\b[^>]*href="https:\/\/wa\.me\/918940189694"[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.ok(supportLink);
    assert.match(supportLink, /aria-label="WhatsApp support: \+91 89401 89694 \(opens in a new tab\)"/);
    assert.match(supportLink, /target="_blank"/);
    assert.match(supportLink, /rel="noopener noreferrer"/);
    assert.match(supportLink, /<svg[^>]*aria-hidden="true"/);
    assert.match(headerHtml, /aria-label="Update page"/);
    assert.match(headerHtml, /aria-label="Account: Student Test, ST-001"/);
    const activePath = pathname.startsWith("/student/programme/") ? "/student/programme" : pathname;
    assert.match(html, new RegExp(`aria-current="page"[^>]*href="${activePath}"|href="${activePath}"[^>]*aria-current="page"`));
    if (activePath === "/student/programme") assert.match(headerHtml, /aria-current="page">Programme/);
    assert.match(html, /id="student-content"/);
  }
});

for (const component of ["students", "faculty"]) test(`all ${component} link buttons disable native button semantics`, () => {
  const source = ts.createSourceFile(`${component}.tsx`, readFileSync(new URL(`../src/components/${component}.tsx`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let checked = 0;
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "Button") {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const render = attributes.find((attribute) => attribute.name.getText(source) === "render");
      const element = render?.initializer?.expression;
      if (element && ts.isJsxSelfClosingElement(element) && element.tagName.getText(source) === "Link") {
        const native = attributes.find((attribute) => attribute.name.getText(source) === "nativeButton");
        assert.equal(native?.initializer?.expression?.kind, ts.SyntaxKind.FalseKeyword);
        checked += 1;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(checked, 6);
});

test("create form renders required student fields and valid browser patterns", () => {
  const { StudentForm } = loadStudentComponents();
  const html = renderToStaticMarkup(React.createElement(StudentForm));
  for (const name of ["name", "student_id", "email", "mobile", "gender", "college", "degree", "year", "github", "linkedin", "password", "confirm_password"]) {
    assert.match(html, new RegExp(`name="${name}"`));
  }
  assert.match(html, /minLength="8"/);
  assert.match(html, /maxLength="128"/);
  assert.equal((html.match(/type="password"/g) || []).length, 2);
  for (const match of html.matchAll(/pattern="([^"]+)"/g)) assert.doesNotThrow(() => new RegExp(match[1], "v"));
  assert.doesNotMatch(html, /name="admin_id"|name="password_hash"/);
});

test("edit form renders existing student values without password fields", () => {
  const { StudentForm } = loadStudentComponents();
  const html = renderToStaticMarkup(React.createElement(StudentForm, { student: {
    id: 1, name: "Student Test", student_id: "ST-001", email: "student@example.com", mobile: "+91 9876543210",
    college: "Test College", degree: "Civil Engineering", year: 3, gender: "Female", github: null, linkedin: null, is_active: false,
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  } }));
  assert.match(html, /value="Student Test"/);
  assert.match(html, /value="Civil Engineering"/);
  assert.match(html, /value="Female"/);
  assert.match(html, /Save changes/);
  assert.doesNotMatch(html, /type="password"|name="password"|name="password_hash"/);
});

test("faculty create form renders required fields and exactly four role options", () => {
  const { FacultyForm } = loadStudentComponents("components/faculty");
  const html = renderToStaticMarkup(React.createElement(FacultyForm));
  for (const name of ["name", "email", "role", "password", "confirm_password"]) assert.match(html, new RegExp(`name="${name}"`));
  assert.match(html, /role="combobox"/);
  assert.match(html, /Select role/);
  assert.equal((html.match(/type="password"/g) || []).length, 2);
  assert.match(html, /minLength="8"/);
  assert.match(html, /maxLength="128"/);
  assert.doesNotMatch(html, /name="admin_id"|name="password_hash"/);
  const source = ts.createSourceFile("faculty.tsx", readFileSync(new URL("../src/components/faculty.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const roles = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "SelectItem") {
      roles.push(node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "value").initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(roles, ["Principal", "HOD", "Professor", "Asst. Professor"]);
});

test("faculty edit form preserves each selected role without exposing passwords", () => {
  const { FacultyForm } = loadStudentComponents("components/faculty");
  for (const role of ["Principal", "HOD", "Professor", "Asst. Professor"]) {
    const html = renderToStaticMarkup(React.createElement(FacultyForm, { member: {
      id: 1, name: "Faculty Test", email: "faculty@example.com", role, is_active: false,
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    } }));
    assert.match(html, /value="Faculty Test"/);
    assert.ok(html.includes(`value="${role}"`));
    assert.ok(html.includes(`>${role}</span>`));
    assert.match(html, /Save changes/);
    assert.doesNotMatch(html, /type="password"|name="password"|name="password_hash"/);
  }
});