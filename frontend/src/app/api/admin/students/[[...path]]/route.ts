import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, TOKEN_PATTERN, adminRequest } from "@/lib/admin-session";

const privateHeaders = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ path?: string[] }> };

function failure(detail: string, status: number) {
  return NextResponse.json({ detail }, { status, headers: privateHeaders });
}

async function readBody(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("Invalid body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(value);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid body");
  return JSON.stringify(payload);
}

async function handle(request: NextRequest, context: Context) {
  const { path = [] } = await context.params;
  const collection = path.length === 0;
  const record = path.length === 1 && /^[1-9]\d{0,15}$/.test(path[0]);
  const password = path.length === 2 && /^[1-9]\d{0,15}$/.test(path[0]) && path[1] === "password";
  const invitation = path.length === 2 && /^[1-9]\d{0,15}$/.test(path[0]) && path[1] === "invitation";
  if (!collection && !record && !password && !invitation) return failure("Not found.", 404);
  const allowed = collection ? ["GET", "POST"] : password || invitation ? ["POST"] : ["GET", "PUT", "DELETE"];
  if (!allowed.includes(request.method)) return failure("Method not allowed.", 405);
  if (request.method !== "GET") {
    let expectedOrigin;
    try { expectedOrigin = new URL(process.env.APP_ORIGIN || request.nextUrl.origin).origin; }
    catch { return failure("Student service is temporarily unavailable.", 503); }
    if (request.headers.get("origin") !== expectedOrigin) return failure("Request not allowed.", 403);
  }
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return failure("Please sign in again.", 401);
  const query = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams) {
    if (!collection || request.method !== "GET" || !["page", "page_size", "search", "date_from", "date_to"].includes(key) || value.length > 100 || query.has(key)) {
      return failure("Invalid student filters.", 422);
    }
    query.set(key, value);
  }
  let body: string | undefined;
  if (request.method === "POST" || request.method === "PUT") {
    try { body = await readBody(request); }
    catch { return failure("Enter valid student details.", 422); }
  }
  try {
    const suffix = query.size ? `?${query.toString()}` : "";
    const upstream = await adminRequest(`students/${path.join("/")}${suffix}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body,
    });
    if (upstream.status === 401 || upstream.status === 403) return failure("Please sign in again.", 401);
    if (upstream.status === 404) return failure("Student not found.", 404);
    if (invitation && upstream.status === 429) return failure("Wait one minute before resending this invitation.", 429);
    if (invitation && upstream.status === 409) return failure("Student is already active or email settings are not configured.", 409);
    if (invitation && !upstream.ok) return failure("Invitation unavailable. Check email settings and the configured student app URL. Delivery may be unknown; do not retry immediately.", 503);
    if (upstream.status === 409) return failure("Student ID or email is already in use, including archived accounts.", 409);
    if (upstream.status === 422) return failure("Check the required fields, email, academic year, dates and HTTPS profile links. Passwords must be 8-128 characters.", 422);
    if (!upstream.ok) return failure("Student service is temporarily unavailable. Please try again.", 503);
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers: privateHeaders });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers: privateHeaders });
  } catch {
    return failure("Student service is temporarily unavailable. Please try again.", 503);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;