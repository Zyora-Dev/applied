import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { StudentRegistration } from "@/components/student-registration";
import { getStudent } from "@/lib/student-session";

export const metadata = { title: "Student registration | Applied AI", description: "Create an Applied AI student account." };

export default async function StudentRegisterPage() {
  if (await getStudent()) redirect("/student");
  return <AuthShell audience="student"><StudentRegistration /></AuthShell>;
}