import { NextRequest, NextResponse } from "next/server";
import { FACULTY_COOKIE, TOKEN_PATTERN, facultyRequest } from "@/lib/faculty-session";
import { UUID_PATTERN } from "@/lib/submissions";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
type Context = { params: Promise<{ path: string[] }> };

function failure(status = 503) {
  const messages: Record<number, string> = { 401: "Please sign in again, or check your email and password.", 403: "Request not allowed.",
    404: "Student or submission not found.", 405: "Method not allowed.", 409: "This submission has a newer review. Close this dialog and refresh before grading again.",
    422: "Check the fields and date range.", 429: "Too many attempts. Please wait one minute.", 503: "Faculty portal is temporarily unavailable. Please try again." };
  return NextResponse.json({ detail: messages[status] || messages[503] }, { status, headers: privateHeaders });
}

async function bounded(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new Error();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

async function handle(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const auth = path.length === 1 && ["login", "logout"].includes(path[0]);
  const collection = path.length === 1 && path[0] === "students";
  const student = path[0] === "students" && /^[1-9][0-9]{0,14}$/.test(path[1] || "");
  const history = student && path.length === 3 && path[2] === "submissions";
  const attempt = student && path.length === 5 && path[2] === "submissions" && UUID_PATTERN.test(path[3]);
  const reviews = attempt && path[4] === "reviews";
  const download = attempt && path[4] === "download";
  if (!(auth || collection || (student && path.length === 2) || history || reviews || download)) return failure(404);
  if (auth ? request.method !== "POST" : request.method !== "GET" && !(reviews && request.method === "POST")) return failure(405);
  if (request.method === "POST") {
    let origin;
    try { origin = new URL(process.env.APP_ORIGIN || "http://localhost:3300").origin; } catch { return failure(); }
    if (request.headers.get("origin") !== origin) return failure(403);
  }
  const query = request.nextUrl.searchParams;
  const allowed = collection ? ["page", "search", "start", "end"] : history ? ["page", "week", "kind", "start", "end"] : reviews ? ["page"] : [];
  if ((request.method === "POST" && query.size) || [...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)
    || (query.has("page") && (!/^[1-9][0-9]{0,6}$/.test(query.get("page")!) || Number(query.get("page")) > (collection ? 1000000 : 1000)))
    || (query.has("search") && query.get("search")!.length > 100)
    || (query.has("week") && !/^[1-4]$/.test(query.get("week")!))
    || (query.has("kind") && !["practical", "homework"].includes(query.get("kind")!))
    || ["start", "end"].some(key => query.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(query.get(key)!))) return failure(422);
  const token = request.cookies.get(FACULTY_COOKIE)?.value;
  if (!auth && (!token || !TOKEN_PATTERN.test(token))) return failure(401);
  let payload;
  if (request.method === "POST" && path[0] !== "logout") {
    try {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error();
      const fields = JSON.parse((await bounded(request.body, auth ? 8192 : 65536)).toString("utf8"));
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error();
      if (auth) {
        if (typeof fields.email !== "string" || !fields.email.trim() || fields.email.length > 254
          || typeof fields.password !== "string" || !fields.password || fields.password.length > 1024) throw new Error();
        payload = { email: fields.email.trim(), password: fields.password };
      } else {
        if (Object.keys(fields).some(key => !["score", "feedback", "expected_review_id"].includes(key))
          || !Number.isInteger(fields.score) || fields.score < 0 || fields.score > 100
          || typeof fields.feedback !== "string" || !fields.feedback.trim() || fields.feedback.length > 10000
          || (fields.expected_review_id != null && (typeof fields.expected_review_id !== "string" || !UUID_PATTERN.test(fields.expected_review_id)))) throw new Error();
        payload = { score: fields.score, feedback: fields.feedback, expected_review_id: fields.expected_review_id ?? null };
      }
    } catch { return failure(422); }
  }
  try {
    if (auth && path[0] === "logout") {
      if (token && TOKEN_PATTERN.test(token)) {
        const upstream = await facultyRequest("logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        if (!upstream.ok && upstream.status !== 401) return failure();
      }
      const response = new NextResponse(null, { status: 204, headers: privateHeaders });
      response.cookies.set(FACULTY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }
    const upstream = await facultyRequest(`${path.join("/")}${collection ? "/" : ""}${query.size ? `?${query}` : ""}`, {
      method: request.method, headers: { "Content-Type": "application/json", ...(!auth ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!upstream.ok) return failure([401, 403, 404, 409, 422, 429].includes(upstream.status) ? upstream.status : 503);
    if (download) {
      const bytes = await bounded(upstream.body, 2097152);
      if (!bytes.length) return failure();
      return new NextResponse(bytes, { headers: { ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Security-Policy": "sandbox",
        "Content-Disposition": `attachment; filename="submission-${path[3]}.ipynb"` } });
    }
    const result = JSON.parse((await bounded(upstream.body, auth ? 8192 : 8388608)).toString("utf8"));
    if (auth) {
      const expiry = new Date(result.expires_at);
      if (typeof result.access_token !== "string" || !TOKEN_PATTERN.test(result.access_token) || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) return failure();
      const response = NextResponse.json({ success: true }, { headers: privateHeaders });
      response.cookies.set(FACULTY_COOKIE, result.access_token, { ...cookieOptions, expires: new Date(Math.min(expiry.getTime(), Date.now() + 28800000)) });
      return response;
    }
    return NextResponse.json(result, { status: upstream.status, headers: privateHeaders });
  } catch { return failure(); }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;