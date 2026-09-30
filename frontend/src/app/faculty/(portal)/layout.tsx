import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireFaculty } from "@/lib/faculty-session";
import { FacultyShell } from "@/components/faculty-shell";

export const metadata: Metadata = { title: "Faculty | Applied AI", robots: { index: false, follow: false } };

export default async function FacultyLayout({ children }: { children: ReactNode }) {
  const faculty = await requireFaculty();
  return <FacultyShell name={faculty.name} role={faculty.role}>{children}</FacultyShell>;
}