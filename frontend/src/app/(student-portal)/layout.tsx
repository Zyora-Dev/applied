import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireStudent } from "@/lib/student-session";
import { StudentShell } from "@/components/student-shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StudentPortalLayout({ children }: { children: ReactNode }) {
  const student = await requireStudent();
  return <StudentShell name={student.name} studentId={student.student_id}>{children}</StudentShell>;
}