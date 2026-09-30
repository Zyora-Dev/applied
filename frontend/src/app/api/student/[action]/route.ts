import { NextRequest, NextResponse } from "next/server";
import { STUDENT_COOKIE, TOKEN_PATTERN, studentRequest } from "@/lib/student-session";

const privateHeaders = { "Cache-Control": "no-store" };
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

function failure(detail: string, status: number) {
  return NextResponse.json({ detail }, { status, headers: privateHeaders });
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!["login", "logout", "invitation", "setup-password"].includes(action)) return failure("Not found.", 404);
  let origin;
  try { origin = new URL(process.env.APP_ORIGIN || request.nextUrl.origin).origin; }
  catch { return failure("Authentication is temporarily unavailable.", 503); }
  if (request.headers.get("origin") !== origin) return failure("Request not allowed.", 403);
  if (request.nextUrl.searchParams.size) return failure("Invalid request.", 422);

  if (action === "logout") {
    const token = request.cookies.get(STUDENT_COOKIE)?.value;
    if (token && TOKEN_PATTERN.test(token)) {
      try {
        const upstream = await studentRequest("logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        if (!upstream.ok && upstream.status !== 401) return failure("Unable to sign out. Please try again.", 503);
      } catch { return failure("Unable to sign out. Please try again.", 503); }
    }
    const response = new NextResponse(null, { status: 204, headers: privateHeaders });
    response.cookies.set(STUDENT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }

  let payload;
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error();
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    const fields = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (action === "invitation" || action === "setup-password") {
      if (!fields || typeof fields.token !== "string" || !TOKEN_PATTERN.test(fields.token)) return failure("Invalid invitation link. Ask your administrator for a new invitation.", 422);
      if (action === "setup-password" && (typeof fields.password !== "string" || fields.password.length < 8 || fields.password.length > 128 || fields.password !== fields.confirm_password)) return failure("Use matching passwords of 8-128 characters.", 422);
      const body = action === "invitation" ? { token: fields.token } : { token: fields.token, password: fields.password, confirm_password: fields.confirm_password };
      let upstream;
      try { upstream = await studentRequest(action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
      catch { return failure("Unable to connect. Please try again.", 503); }
      if (upstream.status === 400) return failure("This invitation is invalid or expired. Ask your administrator for a new invitation.", 400);
      if (upstream.status === 429) return failure("Too many attempts. Please wait one minute.", 429);
      if (upstream.status === 422) return failure("Check your invitation and matching passwords (8-128 characters).", 422);
      if (!upstream.ok) return failure("Password setup is temporarily unavailable. Please try again.", 503);
      if (action === "setup-password") return new NextResponse(null, { status: 204, headers: privateHeaders });
      const result = await upstream.json();
      return NextResponse.json({ name: result.name, email: result.email, expires_at: result.expires_at }, { headers: privateHeaders });
    }
    if (!fields || typeof fields.email !== "string" || typeof fields.password !== "string") throw new Error();
    if (!fields.email.trim() || fields.email.length > 254 || !fields.password || fields.password.length > 1024) throw new Error();
    payload = { email: fields.email.trim(), password: fields.password };
  } catch { return failure("Enter a valid email and password.", 422); }

  try {
    const upstream = await studentRequest("login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (upstream.status === 401) return failure("Invalid email or password.", 401);
    if (upstream.status === 422) return failure("Enter a valid email and password.", 422);
    if (upstream.status === 429) {
      const response = failure("Too many attempts. Please try again in one minute.", 429);
      response.headers.set("Retry-After", "60");
      return response;
    }
    if (!upstream.ok) return failure("Sign in is temporarily unavailable. Please try again.", 503);
    const result = await upstream.json();
    const expiry = new Date(result.expires_at);
    if (typeof result.access_token !== "string" || !TOKEN_PATTERN.test(result.access_token) || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error();
    const response = NextResponse.json({ success: true }, { headers: privateHeaders });
    response.cookies.set(STUDENT_COOKIE, result.access_token, { ...cookieOptions, expires: new Date(Math.min(expiry.getTime(), Date.now() + 28_800_000)) });
    return response;
  } catch { return failure("Sign in is temporarily unavailable. Please try again.", 503); }
}