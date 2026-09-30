import type { Metadata } from "next";
import { StudentSetupPassword } from "@/components/student-setup-password";

export const metadata: Metadata = { title: "Set Up Password | Applied AI", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function SetupPasswordPage() {
  return <StudentSetupPassword />;
}