import { NextRequest, NextResponse } from "next/server";
import { STUDENT_COOKIE, TOKEN_PATTERN, studentRequest } from "@/lib/student-session";
import { parseReceipt, UUID_PATTERN } from "@/lib/submissions";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
type Context = { params: Promise<{ path: string[] }> };
const safeDetails = new Set([
  "This week is locked.", "Submission not found.", "Notebook exceeds the 2 MiB limit.",
  "Select a valid Jupyter notebook (.ipynb, format 4).", "Notebook is unavailable. Select an accessible file from Google Drive.",
  "Notebook changed during download. Save it in Colab and submit again.", "Connect Google Drive to select a notebook.",
  "Reconnect Google Drive to select a notebook.", "Reconnect Google Drive and select the notebook again.",
  "Google Drive connection changed. Select your notebook again.", "The limit of 20 submissions for this week has been reached.",
  "This submission request was already used for another notebook.", "Start date must not be after end date.",
]);

function failure(status = 503, detail = "Submission request could not be confirmed. Check history and retry.") {
  return NextResponse.json({ detail: status === 401 ? "Please sign in again." : detail }, { status, headers: privateHeaders });
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
  if (!path || !/^[1-4]$/.test(path[0]) || !(path.length === 1 || (path.length === 3 && UUID_PATTERN.test(path[1]) && path[2] === "download"))) return failure(404);
  const download = path.length === 3;
  if (request.method !== "GET" && (request.method !== "POST" || download)) return failure(405);
  if (request.method === "POST") {
    let origin;
    try { origin = new URL(process.env.APP_ORIGIN || "http://localhost:3300").origin; }
    catch { return failure(); }
    if (request.headers.get("origin") !== origin) return failure(403, "Request not allowed.");
  }
  const token = request.cookies.get(STUDENT_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return failure(401);
  const query = request.nextUrl.searchParams;
  if ((download || request.method === "POST") && query.size) return failure(422, "Invalid request.");
  if ([...query.keys()].some(key => !["page", "start", "end", "kind"].includes(key) || query.getAll(key).length !== 1)
    || (query.has("kind") && !["practical", "homework"].includes(query.get("kind")!))
    || (query.has("page") && !/^[1-9][0-9]{0,2}$|^1000$/.test(query.get("page")!))
    || ["start", "end"].some(key => query.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(query.get(key)!))) return failure(422, "Invalid request.");
  let payload;
  if (request.method === "POST") {
    try {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error();
      payload = JSON.parse((await bounded(request.body, 2048)).toString("utf8"));
      if (!payload || Object.keys(payload).some(key => !["file_id", "request_id", "kind"].includes(key))
        || (payload.kind !== undefined && !["practical", "homework"].includes(payload.kind))
        || typeof payload.file_id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.file_id)
        || typeof payload.request_id !== "string" || !UUID_PATTERN.test(payload.request_id)) throw new Error();
    } catch { return failure(422, "Select a notebook and try again."); }
  }
  const week = Number(path[0]);
  try {
    const action = download ? `submissions/${week}/${path[1]}/download` as const : `submissions/${week}${query.size ? `?${query}` : ""}` as `submissions/${number}`;
    const upstream = await studentRequest(action, { method: request.method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    if (!upstream.ok) {
      const status = [401, 403, 404, 409, 413, 422, 429].includes(upstream.status) ? upstream.status : 503;
      let detail;
      try { const result = JSON.parse((await bounded(upstream.body, 16384)).toString("utf8")); if (safeDetails.has(result.detail)) detail = result.detail; } catch {}
      return failure(status, detail);
    }
    if (download) {
      const bytes = await bounded(upstream.body, 2097152);
      if (!bytes.length) return failure();
      return new NextResponse(bytes, { headers: { ...privateHeaders, "Content-Type": "application/octet-stream",
        "Content-Security-Policy": "sandbox", "Content-Disposition": `attachment; filename="submission-${path[1]}.ipynb"` } });
    }
    const result = JSON.parse((await bounded(upstream.body, 524288)).toString("utf8"));
    if (request.method === "POST") return NextResponse.json(parseReceipt(result, week), { status: upstream.status === 201 ? 201 : 200, headers: privateHeaders });
    if (!Array.isArray(result.items) || result.items.length > 10 || !Number.isInteger(result.total) || result.total < 0 || result.total > 20
      || result.page_size !== 10 || result.page !== Number(query.get("page") || 1)) return failure();
    return NextResponse.json({ items: result.items.map((item: unknown) => parseReceipt(item, week)), total: result.total, page: result.page, page_size: 10 }, { headers: privateHeaders });
  } catch { return failure(); }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;