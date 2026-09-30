export const facultyRoles = ["Principal", "HOD", "Professor", "Asst. Professor"] as const;
export type FacultyRole = typeof facultyRoles[number];
export type Faculty = {
  id: number;
  name: string;
  role: FacultyRole;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type FacultyListResult = { items: Faculty[]; total: number; page: number; page_size: number };

export async function facultyRequest<T>(path = "", init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/admin/faculty/${path}`, { ...init, cache: "no-store" });
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.detail === "string" ? result.detail : "Unable to complete the request.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const facultyDate = (value: string) => new Intl.DateTimeFormat("en-IN", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
}).format(new Date(value));

export const facultyCard = "gap-0 rounded-lg border border-border bg-[#111111] py-0 ring-0";