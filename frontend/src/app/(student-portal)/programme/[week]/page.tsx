import { notFound, redirect } from "next/navigation";

export default async function WeekRedirect({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!/^[1-4]$/.test(week)) notFound();
  redirect(`/student/programme/${week}`);
}