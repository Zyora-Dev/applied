import "server-only";
import { NextRequest } from "next/server";
import { backendRequest, privateJson, sameOrigin, SESSION_COOKIE } from "@/lib/admin-session";

type Context = { params: Promise<{ path?: string[] }> };

export function recordsProxy(resource: "students" | "faculty") {
  return async function forward(request: NextRequest, context: Context) {
    const segments = (await context.params).path ?? [];
    const collection = segments.length === 0;
    const summary = resource === "students" && segments.length === 1 && segments[0] === "summary";
    const record = segments.length === 1 && /^[1-9][0-9]*$/.test(segments[0]);
    const progress = resource === "students" && segments.length === 2 && /^[1-9][0-9]*$/.test(segments[0]) && segments[1] === "progress";
    const weekProgress = resource === "students" && segments.length === 3 && /^[1-9][0-9]*$/.test(segments[0]) && segments[1] === "progress" && /^[1-4]$/.test(segments[2]);
    if (!collection && !summary && !record && !progress && !weekProgress) return privateJson({ error: "Not found." }, 404);
    if (!(request.method === "GET" && (collection || summary || progress)) &&
      !(request.method === "POST" && collection) && !(request.method === "PUT" && (record || weekProgress)) &&
        !(request.method === "DELETE" && resource === "students" && record)) {
      return privateJson({ error: "Method not allowed." }, 405);
    }
    if (request.method !== "GET" && !sameOrigin(request)) return privateJson({ error: "Request not allowed." }, 403);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return privateJson({ error: "Your session has expired. Please sign in again." }, 401);
    let body: string | undefined;
    if (request.method === "POST" || request.method === "PUT") {
      if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "A JSON request is required." }, 415);
      body = await request.text();
      if (body.length > 16_384) return privateJson({ error: "Request is too large." }, 413);
      try { JSON.parse(body); } catch { return privateJson({ error: "Invalid request." }, 400); }
    }
    try {
      const suffix = segments.length ? `/${segments.join("/")}` : "";
      const query = new URLSearchParams();
      for (const key of ["search", "page", "page_size", "date_from", "date_to"]) {
        const value = request.nextUrl.searchParams.get(key);
        if (value) query.set(key, value);
      }
      const response = await backendRequest(`/admin/${resource}${suffix}${query.size ? `?${query}` : ""}`, {
        method: request.method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      });
      if (response.status === 401) return privateJson({ error: "Your session has expired. Please sign in again." }, 401);
      if (response.status >= 500) return privateJson({ error: "The service is unavailable. Please try again." }, 503);
      const result = await response.json();
      if (!response.ok) {
        const error = typeof result.detail === "string" ? result.detail : "Please check the account details.";
        const fields: Record<string, string> = {};
        if (Array.isArray(result.detail)) {
          for (const issue of result.detail) {
            if (Array.isArray(issue.loc) && typeof issue.msg === "string") fields[String(issue.loc.at(-1))] = issue.msg.replace(/^Value error, /, "");
          }
        }
        return privateJson({ error, fields }, response.status);
      }
      return privateJson(result, response.status);
    } catch {
      return privateJson({ error: "Cannot reach the service. Please try again." }, 503);
    }
  };
}