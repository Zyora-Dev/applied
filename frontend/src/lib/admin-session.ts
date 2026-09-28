import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "applied_ai_admin";
export const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8900";
export type Admin = { id: number; email: string };

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function sameOrigin(request: NextRequest) {
  const publicUrl = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if (!publicUrl) return request.headers.get("origin") === request.nextUrl.origin;
  try {
    const expected = new URL(publicUrl);
    if (expected.protocol !== "https:" && expected.protocol !== "http:") return false;
    return request.headers.get("origin") === expected.origin;
  } catch {
    return false;
  }
}

export async function backendRequest(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function getAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const response = await backendRequest("/admin/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Administration service unavailable");
  return response.json();
}