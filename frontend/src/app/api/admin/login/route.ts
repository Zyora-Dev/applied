import { NextRequest } from "next/server";
import { backendRequest, privateJson, sameOrigin, SESSION_COOKIE } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return privateJson({ error: "Request not allowed." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "A JSON request is required." }, 415);
  }
  let payload: { email?: unknown; password?: unknown };
  try {
    const text = await request.text();
    if (text.length > 4096) return privateJson({ error: "Request is too large." }, 413);
    payload = JSON.parse(text);
  } catch {
    return privateJson({ error: "Invalid request." }, 400);
  }
  if (!payload || typeof payload.email !== "string" || typeof payload.password !== "string" ||
    !payload.email.trim() || payload.email.length > 320 || !payload.password || payload.password.length > 1024) {
    return privateJson({ error: "Enter your email address and password." }, 422);
  }
  try {
    const upstream = await backendRequest("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: payload.email.trim(), password: payload.password }),
    });
    if (upstream.status === 429) {
      const response = privateJson({ error: "Too many sign-in attempts. Please try again in a minute." }, 429);
      response.headers.set("Retry-After", "60");
      return response;
    }
    if (upstream.status === 401 || upstream.status === 422) {
      return privateJson({ error: "The email or password is incorrect." }, 401);
    }
    if (!upstream.ok) return privateJson({ error: "Sign-in is temporarily unavailable. Please try again." }, 503);
    const result = await upstream.json();
    if (typeof result.access_token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.access_token)) {
      return privateJson({ error: "Sign-in is temporarily unavailable. Please try again." }, 503);
    }
    const response = privateJson({ admin: result.admin });
    response.cookies.set(SESSION_COOKIE, result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 28_800,
    });
    return response;
  } catch {
    return privateJson({ error: "Cannot reach the sign-in service. Please try again." }, 503);
  }
}