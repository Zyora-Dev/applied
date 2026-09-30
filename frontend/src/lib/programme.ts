import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, adminRequest } from "@/lib/admin-session";
import { STUDENT_COOKIE, TOKEN_PATTERN, studentRequest } from "@/lib/student-session";

export type WeekAccess = { week: number; is_open: boolean };

export async function getProgrammeWeeks(audience: "admin" | "student"): Promise<WeekAccess[]> {
  const token = (await cookies()).get(audience === "admin" ? ADMIN_COOKIE : STUDENT_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) redirect(`/${audience}/login`);
  const request = audience === "admin" ? adminRequest : studentRequest;
  const response = await request("programme", { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) redirect(`/${audience}/login`);
  if (!response.ok) throw new Error("Programme access is temporarily unavailable.");
  const weeks = await response.json();
  if (!Array.isArray(weeks) || weeks.length !== 4 || !weeks.every((item, index) => item?.week === index + 1 && typeof item.is_open === "boolean")) {
    throw new Error("Programme access is temporarily unavailable.");
  }
  return weeks.map(({ week, is_open }) => ({ week, is_open }));
}

export async function requireOpenWeek(week: number): Promise<void> {
  const token = (await cookies()).get(STUDENT_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) redirect("/student/login");
  const response = await studentRequest(`programme/${week}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) redirect("/student/login");
  if (response.status === 403) redirect("/student/programme");
  if (response.status === 404 || response.status === 422) notFound();
  if (!response.ok) throw new Error("Programme access is temporarily unavailable.");
  const access = await response.json();
  if (access?.week !== week || access.is_open !== true) throw new Error("Programme access is temporarily unavailable.");
}