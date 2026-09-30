import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_COOKIE = "applied_ai_admin";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AdminAccount = {
  id: number;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function adminRequest(action: "login" | "me" | "logout" | "settings/email" | "settings/password" | "programme" | `programme/${number}` | `students/${string}` | `faculty/${string}`, init: RequestInit = {}) {
  const base = (process.env.API_BASE_URL || "http://127.0.0.1:8900").replace(/\/$/, "");
  return fetch(`${base}/admin/${action}`, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function requireAdmin(): Promise<AdminAccount> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) redirect("/admin/login");

  const response = await adminRequest("me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) redirect("/admin/login");
  if (!response.ok) throw new Error("Admin account is temporarily unavailable.");
  return response.json();
}