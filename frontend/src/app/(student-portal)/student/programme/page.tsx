import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, BookOpen, CalendarDays, Flame, LockKeyhole, Network, Smile } from "lucide-react";
import { requireStudent } from "@/lib/student-session";
import { getProgrammeWeeks } from "@/lib/programme";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Programme | Applied AI" };

export default async function ProgrammePage() {
  await requireStudent();
  const weeks = await getProgrammeWeeks("student");
  return <>
    <section className="flex flex-wrap items-center justify-between gap-4 pb-1"><h1 className="text-2xl font-semibold">Programme</h1><span className="flex items-center gap-2 text-sm text-white"><CalendarDays aria-hidden="true" className="size-4 text-primary" />4 weeks</span></section>
    <Card aria-labelledby="programme-title" className="min-w-0 gap-0 rounded-lg border border-white/20 bg-[#171917] py-0 text-white ring-0">
      <div className="relative isolate flex h-44 flex-col justify-end overflow-hidden bg-[#111222] sm:h-52">
        <Image src="https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1400&q=85" alt="AI lettering surrounded by interconnected digital pathways" fill unoptimized loading="lazy" sizes="(max-width: 768px) 100vw, 1200px" className="-z-10 object-cover object-center" />
        <CardHeader className="flex w-64 max-w-full flex-col items-start gap-2 self-start rounded-none bg-black/75 px-5 py-4 sm:px-7 sm:py-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase text-primary"><BookOpen aria-hidden="true" className="size-4" />Programme</p>
          <CardTitle><h2 id="programme-title" className="text-2xl leading-tight font-semibold break-words">Applied AI</h2></CardTitle>
        </CardHeader>
      </div>
      <CardContent className="px-5 py-4 sm:px-7">
        <ul aria-label="Programme topics" className="flex flex-wrap gap-x-6 gap-y-3 sm:grid sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/20">
          {[
            { name: "PyTorch", icon: Flame },
            { name: "Transformer", icon: Network },
            { name: "Hugging Face", icon: Smile },
          ].map(({ name, icon: Icon }) => <li key={name} className="flex min-w-0 items-center gap-3 sm:px-5 sm:first:pl-0 sm:last:pr-0"><Icon aria-hidden="true" className="size-5 shrink-0 text-primary" /><span className="text-sm font-medium break-words">{name}</span></li>)}
        </ul>
      </CardContent>
    </Card>
    <section aria-labelledby="programme-weeks" className="space-y-4">
      <h2 id="programme-weeks" className="text-lg font-semibold">Weekly outline</h2>
      <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4 lg:gap-4">
        {weeks.map(({ week: number, is_open }) => <Card key={number} aria-labelledby={`week-${number}`} className="relative min-w-0 gap-0 rounded-lg border border-white/20 bg-[#f5f6f4] pt-0 text-[#171b16] shadow-sm ring-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-5 lg:px-5">
            <CardTitle><h3 id={`week-${number}`} className="text-base font-semibold">Week {number}</h3></CardTitle>
            {is_open ? <BookOpen aria-hidden="true" className="size-4 shrink-0" /> : <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />}
          </CardHeader>
          <CardFooter className="mt-auto min-h-12 items-center gap-2 rounded-b-lg border-black/10 bg-black/[0.02] px-4 py-3 text-[#374132] lg:px-5">
            {is_open ? <a href={`/student/programme/${number}`} aria-label={`Open Week ${number}`} className="flex items-center gap-2 text-sm font-medium after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-black"><span>Open week</span><ArrowUpRight aria-hidden="true" className="size-4" /></a> : <p className="text-sm leading-5">Locked</p>}
          </CardFooter>
        </Card>)}
      </div>
    </section>
  </>;
}