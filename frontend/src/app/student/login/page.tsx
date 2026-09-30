import type { Metadata } from "next";
import { StudentLogin } from "@/components/student-login";

export const metadata: Metadata = { title: "Student Sign In | Applied AI", robots: { index: false, follow: false } };

export default function StudentLoginPage() {
  return <StudentLogin />;
}