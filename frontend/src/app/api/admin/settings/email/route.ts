import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, TOKEN_PATTERN, adminRequest } from "@/lib/admin-session";

const privateHeaders = { "Cache-Control": "no-store" };
function failure(detail: string, status: number) {
  return NextResponse.json({ detail }, { status, headers: privateHeaders });
}

async function handle(request: NextRequest) {
  if (request.method !== "GET") {
    let origin;
    try { origin = new URL(process.env.APP_ORIGIN || request.nextUrl.origin).origin; }
    catch { return failure("Email settings are temporarily unavailable.", 503); }
    if (request.headers.get("origin") !== origin) return failure("Request not allowed.", 403);
  }
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return failure("Please sign in again.", 401);
  if (request.nextUrl.searchParams.size) return failure("Invalid request.", 422);
  let body: string | undefined;
  if (request.method === "PUT") {
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
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
      body = JSON.stringify(payload);
    } catch { return failure("Enter valid email settings.", 422); }
  }
  try {
    const upstream = await adminRequest("settings/email", {
      method: request.method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body,
    });
    if (upstream.status === 401 || upstream.status === 403) return failure("Please sign in again.", 401);
    if (upstream.status === 422) return failure("Check the sender name and email. A send-mail token is required for initial setup.", 422);
    if (!upstream.ok) return failure("Email settings are temporarily unavailable.", 503);
    const settings = await upstream.json();
    if (typeof settings.from_name !== "string" || typeof settings.from_email !== "string" || typeof settings.token_configured !== "boolean") throw new Error();
    return NextResponse.json({ from_name: settings.from_name, from_email: settings.from_email, token_configured: settings.token_configured }, { headers: privateHeaders });
  } catch { return failure("Email settings are temporarily unavailable.", 503); }
}

export const GET = handle;
export const PUT = handle;