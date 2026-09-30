import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, TOKEN_PATTERN, adminRequest } from "@/lib/admin-session";

const privateHeaders = { "Cache-Control": "no-store" };
function failure(detail: string, status: number) {
  return NextResponse.json({ detail }, { status, headers: privateHeaders });
}

export async function PUT(request: NextRequest) {
  let origin;
  try { origin = new URL(process.env.APP_ORIGIN || request.nextUrl.origin).origin; }
  catch { return failure("Password change is temporarily unavailable.", 503); }
  if (request.headers.get("origin") !== origin) return failure("Request not allowed.", 403);
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return failure("Please sign in again.", 401);
  if (request.nextUrl.searchParams.size) return failure("Invalid request.", 422);
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
      if (size > 16_384) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error();
    for (const field of ["current_password", "new_password", "confirm_password"]) {
      if (typeof payload[field] !== "string" || !payload[field] || payload[field].length > 1024) throw new Error();
    }
  } catch { return failure("Enter valid current, new and confirmation passwords.", 422); }
  try {
    const upstream = await adminRequest("settings/password", {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (upstream.status === 401 || upstream.status === 403) return failure("Please sign in again.", 401);
    if (upstream.status === 400) return failure("Current password is incorrect.", 400);
    if (upstream.status === 422) return failure("Use 8-128 characters, matching confirmation and a different new password.", 422);
    if (upstream.status === 429) {
      const response = failure("Too many attempts. Please try again in one minute.", 429);
      response.headers.set("Retry-After", "60");
      return response;
    }
    if (upstream.status !== 204) return failure("Password change is temporarily unavailable.", 503);
    const response = new NextResponse(null, { status: 204, headers: privateHeaders });
    response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch { return failure("Password change is temporarily unavailable.", 503); }
}