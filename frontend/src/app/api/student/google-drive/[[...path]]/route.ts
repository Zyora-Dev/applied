import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { STUDENT_COOKIE, TOKEN_PATTERN, studentRequest } from "@/lib/student-session";

const stateCookie = "applied_ai_google_state";
const callbackPath = "/api/student/google-drive/callback";
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: callbackPath };
type Context = { params: Promise<{ path?: string[] }> };

function failure(status = 503) {
  return NextResponse.json({ detail: status === 401 ? "Please sign in again." : "Google Drive request could not be completed." }, { status, headers: privateHeaders });
}

async function handle(request: NextRequest, context: Context) {
  let origin: string;
  try { origin = new URL(process.env.APP_ORIGIN || "http://localhost:3300").origin; }
  catch { return failure(); }
  function destination(path: string, clearState = false) {
    const response = NextResponse.redirect(new URL(path, origin), { status: 303, headers: privateHeaders });
    if (clearState) response.cookies.set(stateCookie, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }
  const { path = [] } = await context.params;
  if (path.length > 1 || (path.length === 1 && !["connect", "callback", "picker"].includes(path[0]))) return failure(404);
  const action = path[0] || "";
  const method = request.method;
  if (!((action === "" && ["GET", "DELETE"].includes(method)) || (["connect", "picker"].includes(action) && method === "POST") || (action === "callback" && method === "GET"))) return failure(405);
  if (method !== "GET" && request.headers.get("origin") !== origin) return failure(403);
  if (action !== "callback" && request.nextUrl.searchParams.size) return failure(422);
  const token = request.cookies.get(STUDENT_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) {
    return action && action !== "picker" ? destination("/student/login", true) : failure(401);
  }
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    if (action === "picker") {
      const upstream = await studentRequest("google-drive/picker", { method: "POST", headers });
      if (upstream.status === 401 || upstream.status === 409) return failure(upstream.status);
      if (!upstream.ok) return failure();
      const result = await upstream.json();
      if (typeof result.access_token !== "string" || !result.access_token || result.access_token.length > 16384
        || !Number.isInteger(result.expires_in) || result.expires_in <= 0 || result.expires_in > 86400
        || typeof result.api_key !== "string" || !result.api_key || result.api_key.length > 256
        || typeof result.project_number !== "string" || !/^[0-9]+$/.test(result.project_number)) return failure();
      return NextResponse.json({ access_token: result.access_token, expires_in: result.expires_in,
        api_key: result.api_key, project_number: result.project_number }, { headers: privateHeaders });
    }
    if (action === "connect") {
      const upstream = await studentRequest("google-drive/connect", { method: "POST", headers });
      if (upstream.status === 401) return destination("/student/login", true);
      if (!upstream.ok) return destination("/profile?google_drive=error", true);
      const result = await upstream.json();
      if (typeof result.state !== "string" || !TOKEN_PATTERN.test(result.state) || typeof result.authorization_url !== "string") throw new Error();
      const url = new URL(result.authorization_url);
      if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash
        || url.searchParams.get("state") !== result.state || url.searchParams.get("redirect_uri") !== `${origin}${callbackPath}`
        || url.searchParams.get("scope") !== "https://www.googleapis.com/auth/drive.file") throw new Error();
      const response = NextResponse.redirect(url, { status: 303, headers: privateHeaders });
      response.cookies.set(stateCookie, result.state, { ...cookieOptions, maxAge: 600 });
      return response;
    }
    if (action === "callback") {
      const query = request.nextUrl.searchParams;
      const state = query.get("state");
      const saved = request.cookies.get(stateCookie)?.value;
      const code = query.get("code");
      const error = query.get("error");
      if (request.nextUrl.search.length > 8192 || [...query.keys()].some((key) => query.getAll(key).length !== 1)
        || !state || !saved || !TOKEN_PATTERN.test(state) || !TOKEN_PATTERN.test(saved)
        || !timingSafeEqual(Buffer.from(state), Buffer.from(saved)) || Boolean(code) === Boolean(error)
        || (code && code.length > 4096) || (error && error.length > 256)) {
        return destination("/profile?google_drive=expired", true);
      }
      const upstream = await studentRequest("google-drive/callback", {
        method: "POST", headers, body: JSON.stringify({ state, ...(error ? { error } : { code }) }),
      });
      if (upstream.status === 401) return destination("/student/login", true);
      const connected = upstream.ok && (await upstream.json()).connected === true;
      const outcome = connected ? "connected" : error === "access_denied" ? "cancelled" : "error";
      return destination(`/profile?google_drive=${outcome}`, true);
    }
    const upstream = await studentRequest("google-drive", { method, headers });
    if (upstream.status === 401) return failure(401);
    if (method === "DELETE" && upstream.status === 204) {
      const response = new NextResponse(null, { status: 204, headers: privateHeaders });
      response.cookies.set(stateCookie, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }
    if (!upstream.ok || method === "DELETE") return failure();
    const result = await upstream.json();
    if (typeof result.connected !== "boolean") return failure();
    return NextResponse.json({ connected: result.connected }, { headers: privateHeaders });
  } catch {
    return action && action !== "picker" ? destination("/profile?google_drive=error", true) : failure();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;