import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarDays, Flame, Layers3, Network, Smile } from "lucide-react";
import { requireStudent } from "@/lib/student-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard | Applied AI" };

export default async function DashboardPage() {
  const student = await requireStudent();
  const details = [["Full name", student.name], ["Email address", student.email], ["College", student.college], ["Degree", student.degree]];
  return <>
    <section className="flex flex-wrap items-end justify-between gap-5 border-b border-white/20 pb-7">
      <div className="min-w-0 space-y-2"><p className="text-sm font-medium text-primary">Your workspace</p><h1 className="text-2xl leading-tight font-semibold break-words sm:text-3xl">Welcome, {student.name}</h1><p className="text-sm text-white">Applied AI <span className="mx-2 text-primary">/</span> Student dashboard</p></div>
    </section>
    <section aria-label="Programme overview" className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <Card className="min-w-0 gap-6 rounded-lg border border-primary bg-primary pt-6 text-black shadow-sm ring-0">
        <CardHeader className="items-center gap-3 px-6">
          <CardTitle className="text-sm font-medium"><h2>Programme name</h2></CardTitle>
          <CardAction><span className="flex size-11 items-center justify-center rounded-lg border border-black/20 bg-black/5"><BookOpen aria-hidden="true" className="size-5" /></span></CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 items-center px-6 pb-2"><p className="text-3xl leading-tight font-semibold break-words">Applied AI</p></CardContent>
        <CardFooter className="rounded-b-lg border-black/20 bg-black/5 px-6 py-4">
          <Button nativeButton={false} render={<Link href="/student/programme" />} className="h-10 w-full justify-between rounded-md bg-black px-4 text-white hover:bg-black/85">View programme<ArrowUpRight /></Button>
        </CardFooter>
      </Card>
      <Card className="min-w-0 gap-6 rounded-lg border border-white/20 bg-[#151515] pt-6 text-white shadow-sm ring-0">
        <CardHeader className="items-center gap-3 px-6">
          <CardTitle className="text-sm font-medium"><h2>Duration</h2></CardTitle>
          <CardAction><span className="flex size-11 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/10 text-amber-300"><CalendarDays aria-hidden="true" className="size-5" /></span></CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 items-baseline gap-3 px-6 pb-2"><p aria-label="4 weeks" className="flex flex-wrap items-baseline gap-3"><span className="text-5xl leading-none font-semibold tabular-nums">4</span><span className="text-lg font-medium">weeks</span></p></CardContent>
        <CardFooter className="rounded-b-lg border-white/15 bg-white/[0.03] px-6 py-5">
          <ol aria-label="Programme weeks" className="grid w-full grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((week) => <li key={week} className="space-y-2 text-center"><div aria-hidden="true" className="h-1 rounded-full bg-amber-300/70" /><span className="text-xs font-medium whitespace-nowrap">Week {week}</span></li>)}
          </ol>
        </CardFooter>
      </Card>
      <Card className="min-w-0 gap-5 rounded-lg border border-white/20 bg-[#151515] py-6 text-white shadow-sm ring-0 sm:col-span-2 xl:col-span-1">
        <CardHeader className="items-center gap-3 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-medium"><Layers3 aria-hidden="true" className="size-4 text-rose-300" /><h2>Topics</h2></CardTitle>
          <CardAction><Badge variant="outline" className="h-7 rounded-md border-white/25 px-2.5 text-white">3 topics</Badge></CardAction>
        </CardHeader>
        <CardContent className="px-6">
          <ul aria-label="Programme topics" className="divide-y divide-white/15">
            {[
              { name: "PyTorch", icon: Flame, accent: "bg-amber-300/10 text-amber-300" },
              { name: "Transformer", icon: Network, accent: "bg-rose-300/10 text-rose-300" },
              { name: "Hugging Face", icon: Smile, accent: "bg-primary/10 text-primary" },
            ].map(({ name, icon: Icon, accent }) => <li key={name} className="flex min-h-14 items-center gap-3 py-2 first:pt-0 last:pb-0"><span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${accent}`}><Icon aria-hidden="true" className="size-4" /></span><span className="text-sm font-medium break-words">{name}</span></li>)}
          </ul>
        </CardContent>
      </Card>
    </section>
    <section aria-labelledby="student-details" className="border-b border-white/20 py-2">
      <div className="mb-6 flex items-center gap-3"><span className="h-5 w-1 rounded-sm bg-primary" /><h2 id="student-details" className="text-base font-semibold">Student details</h2></div>
      <dl className="grid gap-x-10 gap-y-7 pb-7 md:grid-cols-2">{details.map(([label, value]) => <div key={label} className="min-w-0 space-y-2"><dt className="text-sm text-white">{label}</dt><dd className="text-sm font-medium break-words">{value}</dd></div>)}</dl>
    </section>
  </>;
}