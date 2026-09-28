import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { getStudent } from "@/lib/student-session";

export const metadata = { title: "Student sign in | Applied AI", description: "Applied AI student sign in." };

export default async function StudentLoginPage() {
  if (await getStudent()) redirect("/student");
  return <AuthShell audience="student"><LoginForm audience="student" /></AuthShell>;
}