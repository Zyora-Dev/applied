import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, LayoutList, Upload } from "lucide-react";
import { requireStudent } from "@/lib/student-session";
import { requireOpenWeek } from "@/lib/programme";
import { weekOnePracticeOpen } from "@/lib/week-one";
import { NotebookSubmissions } from "@/components/notebook-submissions";
import { WeekOneHandbook, WeekOneHomework, WeekOneOverview } from "@/components/week-one-materials";

export const metadata: Metadata = { title: "Week | Applied AI" };

const views = [
  { id: "overview", label: "Overview", icon: LayoutList },
  { id: "handbook", label: "Handbook", icon: BookOpen },
  { id: "homework", label: "Homework", icon: ClipboardList },
  { id: "submission", label: "Submission", icon: Upload },
];

export default async function WeekPage({ params, searchParams }: {
  params: Promise<{ week: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  await requireStudent();
  const { week } = await params;
  if (!/^[1-4]$/.test(week)) notFound();
  await requireOpenWeek(Number(week));
  const requestedView = (await searchParams)?.tab;
  const view = typeof requestedView === "string" && views.some(item => item.id === requestedView) ? requestedView : "overview";
  return <section className="space-y-6">
    <Link href="/student/programme" prefetch={false} className="inline-flex min-h-9 items-center gap-2 text-sm font-medium"><ArrowLeft aria-hidden="true" className="size-4" />Programme</Link>
    <h1 className="text-2xl font-semibold">Week {week}</h1>
    <nav aria-label="Week views" className="grid grid-cols-2 gap-2 border-b border-white/20 pb-2 sm:grid-cols-4">
      {views.map(({ id, label, icon: Icon }) => {
        const day = week === "1" ? id === "handbook" ? "Wednesday, Sep 30" : id === "homework" ? "Friday, Oct 2" : undefined : undefined;
        return <a key={id} href={`/student/programme/${week}?tab=${id}`} aria-current={view === id ? "page" : undefined} className={`inline-flex min-h-20 min-w-0 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary ${view === id ? "bg-primary text-black" : "text-white hover:bg-white/10"}`}>
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
            {day && <span className="block text-sm font-semibold">{day}</span>}
            <span className="block">{week === "1" && id === "homework" ? "Handbook & Exercises" : label}</span>
          </span>
        </a>;
      })}
    </nav>
    {week === "1" && !weekOnePracticeOpen() && <p className="text-sm text-white">Friday handbook, exercises and homework open on October 2 at 12:00 AM IST.</p>}
    {view === "submission" ? <NotebookSubmissions key={week} week={Number(week)} /> : week !== "1" ?
      <div className="flex items-center gap-3 border-y border-white/20 py-6"><BookOpen aria-hidden="true" className="size-5 text-primary" /><p className="text-sm text-white">Content coming soon</p></div> :
      view === "handbook" ? <WeekOneHandbook /> : view === "homework" ? <WeekOneHomework /> : <WeekOneOverview />}
  </section>;
}