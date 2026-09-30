import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { PasswordSettings } from "@/components/password-settings";
import { GoogleDriveConnection } from "@/components/google-drive-connection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/student-session";

export const metadata: Metadata = { title: "Profile | Applied AI" };

export default async function ProfilePage({ searchParams }: { searchParams?: Promise<{ google_drive?: string }> } = {}) {
  const student = await requireStudent();
  const outcome = (await searchParams)?.google_drive;
  const details = [
    ["Full name", student.name], ["Student ID", student.student_id],
    ["Email address", student.email], ["College", student.college],
    ["Degree", student.degree], ["Academic year", `Year ${student.year}`],
  ];
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold text-white">My profile</h1>
    <Card className="rounded-lg border border-border bg-[#101010] shadow-none ring-0">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Account details</CardTitle></CardHeader>
      <CardContent><dl className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{details.map(([label, value]) => <div key={label} className="min-w-0 space-y-2"><dt className="text-sm text-white">{label}</dt><dd className="text-sm font-medium wrap-anywhere text-white">{value}</dd></div>)}</dl></CardContent>
    </Card>
    <GoogleDriveConnection outcome={outcome} />
    <PasswordSettings audience="student" />
  </div>;
}