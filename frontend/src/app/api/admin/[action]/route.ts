import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, TOKEN_PATTERN, adminRequest } from "@/lib/admin-session";

const privateHeaders = { "Cache-Control": "no-store" };
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status, headers: privateHeaders });
}

async function readLogin(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!payload || typeof payload.email !== "string" || typeof payload.password !== "string") return null;
  if (!payload.email.trim() || payload.email.length > 254 || !payload.password || payload.password.length > 1024) return null;
  return { email: payload.email.trim(), password: payload.password };
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (action !== "login" && action !== "logout") return errorResponse("Not found.", 404);

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(process.env.APP_ORIGIN || request.nextUrl.origin).origin;
  } catch {
    return errorResponse("Authentication is temporarily unavailable.", 503);
  }
  if (request.headers.get("origin") !== expectedOrigin) return errorResponse("Request not allowed.", 403);

  if (action === "logout") {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (token && TOKEN_PATTERN.test(token)) {
      try {
        const upstream = await adminRequest("logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!upstream.ok && upstream.status !== 401) return errorResponse("Unable to sign out. Please try again.", 503);
      } catch {
        return errorResponse("Unable to sign out. Please try again.", 503);
      }
    }
    const response = new NextResponse(null, { status: 204, headers: privateHeaders });
    response.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  }

  let payload;
  try {
    payload = await readLogin(request);
  } catch {
    return errorResponse("Enter a valid email and password.", 422);
  }
  if (!payload) return errorResponse("Enter a valid email and password.", 422);

  try {
    const upstream = await adminRequest("login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (upstream.status === 401) return errorResponse("Invalid email or password.", 401);
    if (upstream.status === 422) return errorResponse("Enter a valid email and password.", 422);
    if (upstream.status === 429) {
      const response = errorResponse("Too many attempts. Please try again in one minute.", 429);
      response.headers.set("Retry-After", "60");
      return response;
    }
    if (!upstream.ok) return errorResponse("Sign in is temporarily unavailable. Please try again.", 503);

    const result = await upstream.json();
    const expiry = new Date(result.expires_at);
    if (typeof result.access_token !== "string" || !TOKEN_PATTERN.test(result.access_token) || !Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      return errorResponse("Sign in is temporarily unavailable. Please try again.", 503);
    }
    const response = NextResponse.json({ success: true }, { headers: privateHeaders });
    response.cookies.set(ADMIN_COOKIE, result.access_token, {
      ...cookieOptions,
      expires: new Date(Math.min(expiry.getTime(), Date.now() + 8 * 60 * 60 * 1000)),
    });
    return response;
  } catch {
    return errorResponse("Sign in is temporarily unavailable. Please try again.", 503);
  }
}