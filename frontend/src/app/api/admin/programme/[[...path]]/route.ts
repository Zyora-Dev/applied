import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, TOKEN_PATTERN, adminRequest } from "@/lib/admin-session";

const privateHeaders = { "Cache-Control": "no-store" };
function failure(detail: string, status: number) {
  return NextResponse.json({ detail }, { status, headers: privateHeaders });
}

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  if (path.length > 1 || (path.length === 1 && !/^[1-4]$/.test(path[0]))) return failure("Week not found.", 404);
  if ((request.method === "GET" && path.length !== 0) || (request.method === "PUT" && path.length !== 1)) return failure("Method not allowed.", 405);
  if (request.method === "PUT") {
    let origin;
    try { origin = new URL(process.env.APP_ORIGIN || request.nextUrl.origin).origin; }
    catch { return failure("Programme access is temporarily unavailable.", 503); }
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
        if (size > 1024) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!payload || Object.keys(payload).length !== 1 || typeof payload.is_open !== "boolean") throw new Error();
      body = JSON.stringify({ is_open: payload.is_open });
    } catch { return failure("Choose a valid week access setting.", 422); }
  }
  try {
    const upstream = await adminRequest(path.length ? `programme/${Number(path[0])}` : "programme", {
      method: request.method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body,
    });
    if (upstream.status === 401 || upstream.status === 403) return failure("Please sign in again.", 401);
    if (!upstream.ok) return failure("Unable to update programme access.", 503);
    const result = await upstream.json();
    const weeks = request.method === "GET" ? result : [result];
    if (!Array.isArray(weeks) || weeks.length !== (request.method === "GET" ? 4 : 1) || !weeks.every((item, index) => item?.week === (request.method === "GET" ? index + 1 : Number(path[0])) && typeof item.is_open === "boolean")) throw new Error();
    const safe = weeks.map(({ week, is_open }) => ({ week, is_open }));
    return NextResponse.json(request.method === "GET" ? safe : safe[0], { headers: privateHeaders });
  } catch { return failure("Programme access is temporarily unavailable.", 503); }
}

export const GET = handle;
export const PUT = handle;