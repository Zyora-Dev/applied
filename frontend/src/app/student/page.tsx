import { redirect } from "next/navigation";
import { StudentDashboard } from "@/components/student-dashboard";
import { getStudent } from "@/lib/student-session";

export const metadata = { title: "Student dashboard | Applied AI", description: "Applied AI student workspace." };

export default async function StudentPage() {
  const student = await getStudent();
  if (!student) redirect("/student/login");
  return <StudentDashboard student={student} />;
}