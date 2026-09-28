import { NextRequest } from "next/server";
import { backendRequest, privateJson, sameOrigin } from "@/lib/admin-session";
import { STUDENT_SESSION_COOKIE } from "@/lib/student-session";

type Context = { params: Promise<{ action: string }> };
const cookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/",
};

export async function GET(request: NextRequest, context: Context) {
  const { action } = await context.params;
  if (!["me", "progress"].includes(action)) return privateJson({ error: "Not found." }, 404);
  const token = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
  if (!token) return privateJson({ error: "Please sign in." }, 401);
  try {
    const upstream = await backendRequest(`/student/${action}`, { headers: { Authorization: `Bearer ${token}` } });
    if (upstream.status === 401) return privateJson({ error: "Please sign in again." }, 401);
    if (!upstream.ok) return privateJson({ error: "Student service unavailable." }, 503);
    return privateJson(await upstream.json());
  } catch { return privateJson({ error: "Cannot reach the student service." }, 503); }
}

export async function POST(request: NextRequest, context: Context) {
  const { action } = await context.params;
  if (!["login", "register", "logout"].includes(action)) return privateJson({ error: "Not found." }, 404);
  if (!sameOrigin(request)) return privateJson({ error: "Request not allowed." }, 403);
  if (action === "logout") {
    const token = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
    if (token) {
      try {
        const upstream = await backendRequest("/student/logout", {
          method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        if (!upstream.ok && upstream.status !== 401) return privateJson({ error: "Could not sign out. Please try again." }, 503);
      } catch { return privateJson({ error: "Could not reach the service. Please try again." }, 503); }
    }
    const response = privateJson({ success: true });
    response.cookies.set(STUDENT_SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "A JSON request is required." }, 415);
  let payload: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 16_384) return privateJson({ error: "Request is too large." }, 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return privateJson({ error: "Invalid request." }, 400);
    payload = parsed as Record<string, unknown>;
  } catch { return privateJson({ error: "Invalid request." }, 400); }
  if (typeof payload.email !== "string" || typeof payload.password !== "string" ||
      !payload.email.trim() || payload.email.length > 320 || !payload.password || payload.password.length > 1024) {
    return privateJson({ error: "Enter your email address and password." }, 422);
  }
  try {
    const upstream = await backendRequest(`/student/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (upstream.status === 429) {
      const response = privateJson({ error: "Too many attempts. Please try again in a minute." }, 429);
      response.headers.set("Retry-After", "60");
      return response;
    }
    if (upstream.status === 401) return privateJson({ error: "The email or password is incorrect." }, 401);
    if (upstream.status >= 500) return privateJson({ error: "Student access is temporarily unavailable. Please contact your administrator." }, 503);
    const result = await upstream.json();
    if (!upstream.ok) {
      const fields: Record<string, string> = {};
      if (Array.isArray(result.detail)) {
        for (const issue of result.detail) {
          if (Array.isArray(issue.loc) && typeof issue.msg === "string") fields[String(issue.loc.at(-1))] = issue.msg.replace(/^Value error, /, "");
        }
      }
      return privateJson({ error: typeof result.detail === "string" ? result.detail : "Please check your details.", fields }, upstream.status);
    }
    if (typeof result.access_token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.access_token)) {
      return privateJson({ error: "Student access is temporarily unavailable." }, 503);
    }
    const response = privateJson({ student: result.student }, upstream.status);
    response.cookies.set(STUDENT_SESSION_COOKIE, result.access_token, { ...cookieOptions, maxAge: 28_800 });
    return response;
  } catch { return privateJson({ error: "Cannot reach the student service. Please try again." }, 503); }
}