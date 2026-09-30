"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, History, LoaderCircle, RefreshCw, Search, SquarePen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Student } from "@/lib/students";
import type { SubmissionHistory, SubmissionKind, SubmissionReceipt, SubmissionReview } from "@/lib/submissions";

type MonitoredStudent = Student & { submissions: SubmissionReceipt[] };
type StudentResult = { items: MonitoredStudent[]; total: number; active: number; page: number; page_size: number };
type ReviewHistory = { items: SubmissionReview[]; total: number; page: number; page_size: number };
const weeks = [1, 2, 3, 4];
const kinds: SubmissionKind[] = ["practical", "homework"];
const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/faculty/students${path}`, { ...init, cache: "no-store" });
  if (response.status === 401) { window.location.replace("/faculty/login"); throw new Error("Please sign in again."); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.detail || "Unable to load student records.");
  }
  return response.json();
}

function useResource<T>(path: string, revision = 0, retainData = false): { data?: T; error?: string } {
  const [state, setState] = useState<{ path: string; revision: number; data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(data => { if (!controller.signal.aborted) setState({ path, revision, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ path, revision, error: error instanceof Error ? error.message : "Unable to load records." }); });
    return () => controller.abort();
  }, [path, revision]);
  return state?.path === path && (state.revision === revision || (retainData && state.data)) ? state : {};
}

function Loading() {
  return <div aria-label="Loading student records" className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
}

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 border-y border-white/20 py-5"><p>{message}</p><Button variant="outline" onClick={retry}><RefreshCw />Retry</Button></div>;
}

function Pagination({ page, total, size, change }: { page: number; total: number; size: number; change: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{total} record{total === 1 ? "" : "s"} / Page {page} of {Math.max(1, Math.ceil(total / size))}</p><div className="flex gap-2"><Button variant="outline" size="icon" title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => change(page - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" title="Next page" aria-label="Next page" disabled={page * size >= total} onClick={() => change(page + 1)}><ChevronRight /></Button></div></div>;
}

function Dates({ start, end, change, prefix }: { start: string; end: string; change: (start: string, end: string) => void; prefix: string }) {
  return <><div className="min-w-0 flex-1 space-y-2 sm:max-w-44"><Label htmlFor={`${prefix}-start`}>From (IST)</Label><Input id={`${prefix}-start`} type="date" value={start} onChange={event => change(event.target.value, end)} /></div><div className="min-w-0 flex-1 space-y-2 sm:max-w-44"><Label htmlFor={`${prefix}-end`}>To (IST)</Label><Input id={`${prefix}-end`} type="date" value={end} onChange={event => change(start, event.target.value)} /></div></>;
}

export function WorkStatus({ receipt }: { receipt?: SubmissionReceipt }) {
  if (!receipt) return <span className="text-white">Not submitted</span>;
  return receipt.review ? <span className="inline-flex items-center gap-1 text-primary"><Check className="size-3.5" />{receipt.review.score}/100</span> : <span className="text-amber-200">Awaiting review</span>;
}

function WeekStatus({ student, week }: { student: MonitoredStudent; week: number }) {
  return <div className="space-y-2 text-xs">{kinds.map(kind => <div key={kind} className="space-y-1"><span className="block text-white">{kind === "practical" ? "Practical" : "Homework"}</span><WorkStatus receipt={student.submissions.find(item => item.week === week && item.kind === kind)} /></div>)}</div>;
}

export function FacultyStudents() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const query = new URLSearchParams({ page: String(page), ...(deferredSearch ? { search: deferredSearch } : {}), ...(start ? { start } : {}), ...(end ? { end } : {}) });
  const { data, error } = useResource<StudentResult>(`?${query}`, revision);
  const retry = () => setRevision(value => value + 1);
  return <>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm text-primary">APPLIED AI</p><h1 className="text-2xl font-semibold">Students</h1></div><Button variant="outline" size="icon" title="Refresh students" aria-label="Refresh students" onClick={retry}><RefreshCw /></Button></div>
    <dl className="grid grid-cols-3 gap-4 border-y border-white/20 py-5">{[["Students", data?.total], ["Active", data?.active], ["Inactive", data ? data.total - data.active : undefined]].map(([label, count]) => <div key={label}><dt className="text-sm">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{count ?? "-"}</dd></div>)}</dl>
    <section className="space-y-5" aria-label="Student monitoring">
      <div className="flex flex-wrap items-end gap-3"><div className="w-full space-y-2 sm:min-w-60 sm:flex-1"><Label htmlFor="faculty-search">Search students</Label><div className="relative"><Search className="absolute top-2.5 left-3 size-4" /><Input id="faculty-search" value={search} maxLength={100} placeholder="Name, ID, email or college" className="pl-10" onChange={event => { setSearch(event.target.value); setPage(1); }} /></div></div><div className="flex w-full flex-wrap gap-3 sm:w-auto"><Dates prefix="students-created" start={start} end={end} change={(from, to) => { setStart(from); setEnd(to); setPage(1); }} /></div></div>
      <p className="text-xs text-white">Student registration dates / Latest submission per week</p>
      {error ? <Failure message={error} retry={retry} /> : !data ? <Loading /> : data.items.length === 0 ? <div className="space-y-4 border-y border-white/20 py-10 text-center"><Users className="mx-auto size-7 text-primary" /><p>{search || start || end ? "No students match these filters." : "No students assigned to your administrator yet."}</p>{(search || start || end || page > 1) && <Button variant="outline" onClick={() => { setSearch(""); setStart(""); setEnd(""); setPage(1); }}>Clear filters</Button>}</div> : <>
        <div className="hidden lg:block"><Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Account</TableHead>{weeks.map(week => <TableHead key={week}>Week {week}</TableHead>)}<TableHead><span className="sr-only">Open student</span></TableHead></TableRow></TableHeader><TableBody>{data.items.map(student => <TableRow key={student.id}><TableCell className="max-w-64 whitespace-normal"><Link className="font-semibold text-white hover:underline [overflow-wrap:anywhere]" href={`/faculty/students/${student.id}`}>{student.name}</Link><p className="mt-1 text-xs">{student.student_id} / {student.degree}, Year {student.year}</p><p className="mt-1 text-xs [overflow-wrap:anywhere]">{student.email}</p></TableCell><TableCell><span className={student.is_active ? "text-primary" : "text-white"}>{student.is_active ? "Active" : "Inactive"}</span></TableCell>{weeks.map(week => <TableCell key={week}><WeekStatus student={student} week={week} /></TableCell>)}<TableCell><Button nativeButton={false} render={<Link href={`/faculty/students/${student.id}`} />} variant="ghost" size="icon" title={`Open ${student.name}`} aria-label={`Open ${student.name}`}><ArrowRight /></Button></TableCell></TableRow>)}</TableBody></Table></div>
        <div className="space-y-4 lg:hidden">{data.items.map(student => <article key={student.id} className="space-y-4 rounded-lg border border-white/25 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-1"><Link href={`/faculty/students/${student.id}`} className="font-semibold [overflow-wrap:anywhere]">{student.name}</Link><p className="text-sm">{student.student_id} / {student.is_active ? "Active" : "Inactive"}</p><p className="text-xs [overflow-wrap:anywhere]">{student.email}</p></div><Button nativeButton={false} render={<Link href={`/faculty/students/${student.id}`} />} variant="outline" size="icon" title={`Open ${student.name}`} aria-label={`Open ${student.name}`}><ArrowRight /></Button></div><div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4 sm:grid-cols-4">{weeks.map(week => <div key={week}><h3 className="mb-3 text-sm font-semibold">Week {week}</h3><WeekStatus student={student} week={week} /></div>)}</div></article>)}</div>
      </>}
      {data && <Pagination page={page} total={data.total} size={20} change={setPage} />}
    </section>
  </>;
}

export function FacultyStudent({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  const { data: student, error } = useResource<MonitoredStudent>(`/${id}`, revision, true);
  const retry = () => setRevision(value => value + 1);
  return <>
    <Button nativeButton={false} render={<Link href="/faculty" />} variant="ghost"><ArrowLeft />Students</Button>
    {error ? <Failure message={error} retry={retry} /> : !student ? <Loading /> : <>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 space-y-2"><h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{student.name}</h1><p>{student.student_id} <span className="mx-2 text-primary">/</span> {student.is_active ? "Active" : "Inactive"}</p></div><Button variant="outline" size="icon" aria-label="Refresh student" title="Refresh student" onClick={retry}><RefreshCw /></Button></div>
      <dl className="grid gap-x-6 gap-y-4 border-y border-white/20 py-5 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Email", student.email], ["Mobile", student.mobile], ["College", student.college], ["Degree", student.degree], ["Year", student.year], ["Gender", student.gender || "Not provided"], ["GitHub", student.github || "Not provided"], ["LinkedIn", student.linkedin || "Not provided"], ["Registered (IST)", dateTime(student.created_at)]].map(([label, value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="mt-1 [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
      <div className="grid grid-cols-2 gap-5 border-b border-white/20 pb-5 sm:grid-cols-4">{weeks.map(week => <section key={week}><h2 className="mb-3 font-semibold">Week {week}</h2><WeekStatus student={student} week={week} /></section>)}</div>
      <StudentWork id={id} revision={revision} refresh={retry} />
    </>}
  </>;
}

function NotebookDownload({ studentId, receipt }: { studentId: string; receipt: SubmissionReceipt }) {
  return <Button nativeButton={false} render={<a href={`/api/faculty/students/${studentId}/submissions/${receipt.id}/download`} />} variant="outline" size="icon" title="Download notebook" aria-label={`Download ${receipt.filename}`}><Download /></Button>;
}

function StudentWork({ id, revision, refresh }: { id: string; revision: number; refresh: () => void }) {
  const [week, setWeek] = useState(1);
  const [kind, setKind] = useState<SubmissionKind>("practical");
  const [page, setPage] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<SubmissionReceipt | null>(null);
  const query = new URLSearchParams({ week: String(week), kind, page: String(page), ...(start ? { start } : {}), ...(end ? { end } : {}) });
  const { data, error } = useResource<SubmissionHistory>(`/${id}/submissions?${query}`, revision);
  return <section className="space-y-5" aria-labelledby="faculty-work-heading">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="faculty-work-heading" className="text-lg font-semibold">Submissions</h2><Button variant="ghost" size="icon" title="Refresh submissions" aria-label="Refresh submissions" onClick={refresh}><RefreshCw /></Button></div>
    <div className="flex flex-wrap items-end gap-4"><div className="space-y-2"><Label htmlFor="faculty-week">Week</Label><select id="faculty-week" value={week} onChange={event => { setWeek(Number(event.target.value)); setPage(1); }} className="h-10 rounded-md border border-white/25 bg-background px-3 text-sm text-white">{weeks.map(value => <option key={value} value={value}>Week {value}</option>)}</select></div><div role="group" aria-label="Work type" className="flex gap-1 rounded-md border border-white/25 p-1">{kinds.map(value => <Button key={value} variant={kind === value ? "default" : "ghost"} aria-pressed={kind === value} onClick={() => { setKind(value); setPage(1); }}>{value === "practical" ? "Practical" : "Homework"}</Button>)}</div><div className="flex w-full gap-3 sm:w-auto"><Dates prefix="faculty-submitted" start={start} end={end} change={(from, to) => { setStart(from); setEnd(to); setPage(1); }} /></div></div>
    {error ? <Failure message={error} retry={refresh} /> : !data ? <Loading /> : data.items.length === 0 ? <p className="border-y border-white/20 py-8">No {kind} submissions{start || end ? " in this date range" : " yet"} for week {week}.</p> : <div className="divide-y divide-white/20 border-y border-white/20">{data.items.map(receipt => <article key={receipt.id} className="space-y-4 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-2"><h3 className="font-medium [overflow-wrap:anywhere]">{receipt.filename}</h3><p className="text-xs">{dateTime(receipt.submitted_at)} IST / {(receipt.size_bytes / 1024).toFixed(1)} KiB</p><WorkStatus receipt={receipt} /></div><div className="flex gap-2"><NotebookDownload studentId={id} receipt={receipt} /><Button variant="outline" onClick={() => setSelected(receipt)}><SquarePen />{receipt.review ? "Review & history" : "Grade"}</Button></div></div>{receipt.review && <div className="space-y-2 text-sm"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{receipt.review.feedback}</p><p>{receipt.review.faculty_name} / {dateTime(receipt.review.reviewed_at)} IST</p></div>}<p className="break-all font-mono text-xs">SHA-256: {receipt.sha256}</p></article>)}</div>}
    {data && <Pagination page={page} total={data.total} size={10} change={setPage} />}
    {selected && <ReviewDialog key={selected.id} studentId={id} receipt={selected} close={() => setSelected(null)} saved={() => { setSelected(null); refresh(); }} />}
  </section>;
}

function ReviewDialog({ studentId, receipt, close, saved }: { studentId: string; receipt: SubmissionReceipt; close: () => void; saved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  const path = `/${studentId}/submissions/${receipt.id}/reviews`;
  const history = useResource<ReviewHistory>(`${path}?page=${page}`, revision);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const fields = new FormData(event.currentTarget);
    submitting.current = true; setPending(true); setError("");
    try {
      await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ score: Number(fields.get("score")), feedback: fields.get("feedback"), expected_review_id: receipt.review?.id ?? null }) });
      saved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Review could not be confirmed. Refresh the history before retrying."); }
    finally { submitting.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) close(); }}><DialogContent className="max-h-[90svh] overflow-y-auto rounded-lg border border-white/25 p-6 sm:max-w-xl" showCloseButton={!pending}>
    <DialogHeader><DialogTitle>Grade {receipt.kind || "homework"}</DialogTitle><DialogDescription className="text-white [overflow-wrap:anywhere]">{receipt.filename} / Week {receipt.week}</DialogDescription></DialogHeader>
    <div className="flex items-center justify-between gap-3 text-xs"><p>{dateTime(receipt.submitted_at)} IST</p><NotebookDownload studentId={studentId} receipt={receipt} /></div>
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}><div className="space-y-2"><Label htmlFor="review-score">Grade (0-100)</Label><Input id="review-score" name="score" type="number" min={0} max={100} step={1} required defaultValue={receipt.review?.score ?? ""} disabled={pending} /></div><div className="space-y-2"><Label htmlFor="review-feedback">Feedback</Label><textarea id="review-feedback" name="feedback" required maxLength={10000} rows={5} defaultValue={receipt.review?.feedback ?? ""} disabled={pending} className="w-full resize-y rounded-md border border-white/25 bg-white/5 p-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div>{error && <p role="alert" className="text-sm text-white">{error}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{pending ? "Saving review..." : "Save review"}</Button></div></form>
    <section className="space-y-4 border-t border-white/20 pt-5" aria-label="Review history"><h3 className="flex items-center gap-2 font-semibold"><History className="size-4" />Review history</h3>{history.error ? <Failure message={history.error} retry={() => setRevision(value => value + 1)} /> : !history.data ? <Skeleton className="h-16" /> : history.data.items.length === 0 ? <p className="text-sm">No reviews yet.</p> : <>{history.data.items.map(review => <article key={review.id} className="space-y-2 border-b border-white/20 pb-4 text-sm"><p className="font-medium text-primary">{review.score}/100</p><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{review.feedback}</p><p>{review.faculty_name} / {dateTime(review.reviewed_at)} IST</p></article>)}<Pagination page={page} total={history.data.total} size={10} change={setPage} /></>}</section>
  </DialogContent></Dialog>;
}