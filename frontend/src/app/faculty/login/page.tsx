import type { Metadata } from "next";
import { StudentLogin } from "@/components/student-login";

export const metadata: Metadata = { title: "Faculty Sign In | Applied AI", robots: { index: false, follow: false } };

export default function FacultyLoginPage() {
  return <StudentLogin portal="faculty" />;
}