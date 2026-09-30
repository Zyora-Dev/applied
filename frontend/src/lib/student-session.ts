import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const STUDENT_COOKIE = "applied_ai_student";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type StudentAccount = { id: number; name: string; email: string; student_id: string; college: string; degree: string; year: number };

export function studentRequest(action: "invitation" | "setup-password" | "login" | "me" | "logout" | "password" | "programme" | `programme/${number}` | `submissions/${number}` | `submissions/${number}/${string}/download` | "google-drive" | "google-drive/connect" | "google-drive/callback" | "google-drive/picker", init: RequestInit = {}) {
  const base = (process.env.API_BASE_URL || "http://127.0.0.1:8900").replace(/\/$/, "");
  return fetch(`${base}/student/${action}`, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(action.startsWith("submissions/") ? 60_000 : 15_000) });
}

export async function requireStudent(): Promise<StudentAccount> {
  const token = (await cookies()).get(STUDENT_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) redirect("/student/login");
  const response = await studentRequest("me", { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) redirect("/student/login");
  if (!response.ok) throw new Error("Student account is temporarily unavailable.");
  return response.json();
}