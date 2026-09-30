import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const FACULTY_COOKIE = "applied_ai_faculty";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export type FacultyAccount = { id: number; admin_id: number; name: string; email: string; role: string };

export function facultyRequest(path: string, init: RequestInit = {}) {
  const base = (process.env.API_BASE_URL || "http://127.0.0.1:8900").replace(/\/$/, "");
  return fetch(`${base}/faculty/${path}`, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
}

export async function requireFaculty(): Promise<FacultyAccount> {
  const token = (await cookies()).get(FACULTY_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) redirect("/faculty/login");
  const response = await facultyRequest("me", { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) redirect("/faculty/login");
  if (!response.ok) throw new Error("Faculty account is temporarily unavailable.");
  return response.json();
}