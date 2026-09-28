import "server-only";
import { cookies } from "next/headers";
import { backendRequest } from "@/lib/admin-session";

export const STUDENT_SESSION_COOKIE = "applied_ai_student";
export type StudentAccount = {
  id: number; name: string; student_id: string; email: string; mobile: string;
  college: string; degree: string; stream: string;
  github_url: string | null; linkedin_url: string | null;
};

export async function getStudent(): Promise<StudentAccount | null> {
  const token = (await cookies()).get(STUDENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  const response = await backendRequest("/student/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Student service unavailable");
  return response.json();
}