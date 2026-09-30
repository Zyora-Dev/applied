"use client";
import { AccountCreated, type CreatedAccount } from "@/components/account-created";
import { StudentInvitations } from "@/components/student-invitations";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, GraduationCap, LoaderCircle, Pencil, Plus, RotateCcw, Save, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { type Student, type StudentListResult, studentCard, studentDate, studentRequest } from "@/lib/students";
import { PasswordFields, StudentActions } from "@/components/student-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const genderOptions = [
  { value: "", label: "Not provided" },
  ...["Male", "Female", "Other", "Prefer not to say"].map((value) => ({ value, label: value })),
];

function Status({ active }: { active: boolean }) {
  return <Badge variant="outline" className={`h-6 rounded-md px-2 text-xs ${active ? "border-primary/40 text-primary" : "border-border text-foreground"}`}>{active ? "Active" : "Inactive"}</Badge>;
}

function Loading() {
  return <div role="status" aria-label="Loading students" className="space-y-4"><span className="sr-only">Loading students...</span>{[1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-14 w-full rounded-md" />)}</div>;
}

function Failure({ error, retry }: { error: string; retry: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/50 p-4"><p role="alert" className="text-sm text-foreground">{error}</p><Button variant="outline" className="h-9" onClick={retry}><RotateCcw className="size-4" />Retry</Button></div>;
}

export function StudentList() {
  const [query, setQuery] = useState("page=1&page_size=20");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<StudentListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Map<number, Student>>(new Map());
  const [selecting, setSelecting] = useState(false);

  function select(student: Student, checked: boolean) {
    setSelected((previous) => { const next = new Map(previous); if (checked) next.set(student.id, student); else next.delete(student.id); return next; });
  }

  async function selectMatching() {
    setSelecting(true);
    setError("");
    try {
      const matches = new Map<number, Student>();
      const params = new URLSearchParams(query);
      params.set("page_size", "100");
      for (let page = 1; ; page += 1) {
        params.set("page", String(page));
        const data = await studentRequest<StudentListResult>(`?${params}`);
        if (data.total > 1000) throw new Error("Narrow the filters to 1,000 students or fewer before selecting all matching.");
        for (const student of data.items) if (!student.is_active) matches.set(student.id, student);
        if (page * data.page_size >= data.total) break;
      }
      setSelected(matches);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to select students."); }
    finally { setSelecting(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    studentRequest<StudentListResult>(`?${query}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setResult(data); setError(""); setLoading(false); }
    }).catch((failure) => {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Unable to load students."); setLoading(false); }
    });
    return () => controller.abort();
  }, [query, revision]);

  function reload() { setLoading(true); setRevision((value) => value + 1); }
  function deleted() {
    setSelected(new Map());
    const params = new URLSearchParams(query);
    if (result?.items.length === 1 && result.page > 1) {
      params.set("page", String(result.page - 1));
      setQuery(params.toString());
    }
    reload();
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("date_from") || "");
    const to = String(data.get("date_to") || "");
    if (from && to && from > to) { setError("Start date must not be after end date."); return; }
    const params = new URLSearchParams({ page: "1", page_size: "20" });
    for (const field of ["search", "date_from", "date_to"]) {
      const value = String(data.get(field) || "").trim();
      if (value) params.set(field, value);
    }
    setQuery(params.toString());
    setSelected(new Map());
    reload();
  }
  function goTo(page: number) {
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    setLoading(true);
    setQuery(params.toString());
  }

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><h1 className="text-lg font-semibold">Students</h1>{result && <Badge variant="outline" className="rounded-md text-sm tabular-nums">{result.total}</Badge>}</div>
      <Button nativeButton={false} render={<Link href="/admin/students/new" />} className="h-9"><Plus className="size-4" />Create student</Button>
    </div>
    <form onSubmit={filter} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_160px_160px_auto]">
      <div className="space-y-2"><Label htmlFor="student-search" className="text-sm">Search</Label><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4" /><Input id="student-search" name="search" placeholder="Name, student ID, email or college" maxLength={100} className="h-9 pl-9 text-sm" /></div></div>
      <div className="space-y-2"><Label htmlFor="student-from" className="text-sm">Created from</Label><Input id="student-from" name="date_from" type="date" max="9998-12-31" className="h-9 min-w-0 text-sm [color-scheme:dark]" /></div>
      <div className="space-y-2"><Label htmlFor="student-to" className="text-sm">Created to</Label><Input id="student-to" name="date_to" type="date" max="9998-12-31" className="h-9 min-w-0 text-sm [color-scheme:dark]" /></div>
      <div className="flex gap-2"><Button type="submit" variant="outline" className="h-9" disabled={loading || selecting}><Search className="size-4" />Apply</Button><Button type="reset" variant="outline" size="icon" className="size-9" aria-label="Clear filters" title="Clear filters" disabled={loading || selecting} onClick={() => { setSelected(new Map()); setQuery("page=1&page_size=20"); reload(); }}><RotateCcw className="size-4" /></Button></div>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4"><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Select inactive students on this page" disabled={loading || selecting || !result?.items.some((student) => !student.is_active)} checked={!!result?.items.some((student) => !student.is_active) && result.items.filter((student) => !student.is_active).every((student) => selected.has(student.id))} onCheckedChange={(checked) => { for (const student of result?.items ?? []) if (!student.is_active) select(student, checked); }} />Select page</label><Button variant="outline" className="h-9" disabled={loading || selecting || !result?.total} onClick={selectMatching}>{selecting && <LoaderCircle className="size-4 animate-spin" />}Select all matching inactive</Button></div><StudentInvitations selected={[...selected.values()]} clear={() => setSelected(new Map())} disabled={loading || selecting} /></div>
    {error && <Failure error={error} retry={reload} />}
    {loading ? <Loading /> : !error && result && <>
      {result.items.length === 0 ? <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-5 py-14 text-center"><UsersRound className="size-8 text-primary" /><h2 className="text-base font-semibold">{result.total ? "No students on this page" : "No students found"}</h2><Button nativeButton={false} render={<Link href="/admin/students/new" />} className="h-9"><Plus className="size-4" />Create student</Button></div> : <>
        <div className="hidden overflow-hidden rounded-lg border border-border bg-[#111111] lg:block">
          <Table>
            <TableHeader><TableRow className="bg-background"><TableHead className="px-5 py-3 text-foreground">Student</TableHead><TableHead className="text-foreground">Contact</TableHead><TableHead className="text-foreground">Education</TableHead><TableHead className="text-foreground">Status</TableHead><TableHead className="text-foreground">Created</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{result.items.map((student) => <TableRow key={student.id}>
              <TableCell className="max-w-60 px-5 py-4"><div className="flex items-start gap-3"><Checkbox className="mt-0.5 shrink-0" aria-label={`Select ${student.name}`} disabled={student.is_active || selecting} checked={selected.has(student.id)} onCheckedChange={(checked) => select(student, checked)} /><div className="min-w-0"><Link href={`/admin/students/${student.id}`} className="block truncate font-medium hover:text-primary hover:underline" title={student.name}>{student.name}</Link><p className="mt-1 truncate text-sm" title={student.student_id}>{student.student_id}</p><p className="mt-1 text-sm">Gender: {student.gender ?? "Not provided"}</p></div></div></TableCell>
              <TableCell className="max-w-60"><p className="truncate" title={student.email}>{student.email}</p><p className="mt-1">{student.mobile}</p></TableCell>
              <TableCell className="max-w-60"><p className="truncate" title={student.college}>{student.college}</p><p className="mt-1 truncate" title={`${student.degree}, Year ${student.year}`}>{student.degree} / Year {student.year}</p></TableCell>
              <TableCell><Status active={student.is_active} /></TableCell><TableCell className="tabular-nums">{studentDate(student.created_at)}</TableCell>
              <TableCell className="pr-4"><StudentActions student={student} onChanged={() => {}} onDeleted={deleted} /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:hidden">{result.items.map((student) => <Card key={student.id} className={studentCard}>
          <CardContent className="space-y-4 p-5">
            <label className="flex items-center gap-2 text-sm"><Checkbox aria-label={`Select ${student.name}`} disabled={student.is_active || selecting} checked={selected.has(student.id)} onCheckedChange={(checked) => select(student, checked)} />Select student</label>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/admin/students/${student.id}`} className="text-sm font-semibold break-words hover:text-primary hover:underline">{student.name}</Link><p className="mt-1 text-sm break-all">{student.student_id}</p></div><StudentActions student={student} onChanged={() => {}} onDeleted={deleted} /></div>
            <dl className="space-y-3 text-sm"><div><dt className="sr-only">Email</dt><dd className="break-all">{student.email}</dd></div><div><dt className="sr-only">Mobile</dt><dd>{student.mobile}</dd></div><div><dt className="sr-only">Education</dt><dd className="break-words">{student.college}<br />{student.degree} / Year {student.year}</dd></div></dl>
            <p className="text-sm">Gender: {student.gender ?? "Not provided"}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><Status active={student.is_active} /><span className="text-sm tabular-nums">{studentDate(student.created_at)}</span></div>
          </CardContent>
        </Card>)}</div>
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="tabular-nums">{result.total === 0 ? "0 students" : `${(result.page - 1) * result.page_size + 1}-${Math.min(result.page * result.page_size, result.total)} of ${result.total} students`}</p>
        <div className="flex items-center gap-3"><Button variant="outline" size="icon" className="size-9" title="Previous page" aria-label="Previous page" disabled={result.page <= 1} onClick={() => goTo(result.page - 1)}><ChevronLeft className="size-4" /></Button><span className="tabular-nums">{result.page} / {Math.max(1, Math.ceil(result.total / result.page_size))}</span><Button variant="outline" size="icon" className="size-9" title="Next page" aria-label="Next page" disabled={result.page * result.page_size >= result.total} onClick={() => goTo(result.page + 1)}><ChevronRight className="size-4" /></Button></div>
      </div>
    </>}
  </>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><dt className="text-sm text-foreground">{label}</dt><dd className="text-sm font-medium break-words [overflow-wrap:anywhere]">{children}</dd></div>;
}

function ProfileLink({ value }: { value: string | null }) {
  if (!value) return <>Not provided</>;
  let safe = false;
  try {
    const url = new URL(value);
    safe = url.protocol === "https:" && !url.username && !url.password;
  } catch { safe = false; }
  if (!safe) return <>{value}</>;
  return <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{value}</a>;
}

export function StudentPage({ id, edit = false }: { id: string; edit?: boolean }) {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    studentRequest<Student>(id, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setStudent(data); setError(""); }
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load student."); });
    return () => controller.abort();
  }, [id, revision]);
  if (error) return <><Button nativeButton={false} variant="outline" render={<Link href="/admin/students" />} className="h-9"><ArrowLeft className="size-4" />Students</Button><Failure error={error} retry={() => { setError(""); setRevision((value) => value + 1); }} /></>;
  if (!student) return <Loading />;
  if (edit) return <StudentForm student={student} />;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><Button nativeButton={false} variant="outline" size="icon" className="size-9 shrink-0" title="Back to students" aria-label="Back to students" render={<Link href="/admin/students" />}><ArrowLeft className="size-4" /></Button><h1 className="text-lg font-semibold">Student profile</h1></div>
      <div className="flex gap-2"><Button nativeButton={false} variant="outline" className="h-9" render={<Link href={`/admin/students/${id}/edit`} />}><Pencil className="size-4" />Edit student</Button><StudentActions student={student} onChanged={() => setRevision((value) => value + 1)} onDeleted={() => router.push("/admin/students")} /></div>
    </div>
    <Card className={studentCard}>
      <CardHeader className="border-b border-border p-5"><div className="flex flex-wrap items-center gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10"><UserRound className="size-5 text-primary" /></span><div className="min-w-0 flex-1"><h2 className="text-base font-semibold break-words">{student.name}</h2><p className="mt-1 text-sm break-all">{student.student_id}</p></div><Status active={student.is_active} /></div></CardHeader>
      <CardContent className="p-5"><dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2"><Detail label="Email address">{student.email}</Detail><Detail label="Mobile number">{student.mobile}</Detail><Detail label="Gender">{student.gender ?? "Not provided"}</Detail><Detail label="GitHub"><ProfileLink value={student.github} /></Detail><Detail label="LinkedIn"><ProfileLink value={student.linkedin} /></Detail></dl></CardContent>
    </Card>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className={studentCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="size-4 text-primary" />Education</CardTitle></CardHeader><CardContent className="p-5"><dl className="grid gap-6 sm:grid-cols-2"><Detail label="College">{student.college}</Detail><Detail label="Degree">{student.degree}</Detail><Detail label="Academic year">Year {student.year}</Detail></dl></CardContent></Card>
      <Card className={studentCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />Account details</CardTitle></CardHeader><CardContent className="p-5"><dl className="grid gap-6 sm:grid-cols-2"><Detail label="Account ID">#{student.id}</Detail><Detail label="Status">{student.is_active ? "Active" : "Inactive"}</Detail><Detail label="Created on">{studentDate(student.created_at)}</Detail><Detail label="Last updated">{studentDate(student.updated_at)}</Detail></dl></CardContent></Card>
    </div>
  </>;
}

export function StudentForm({ student }: { student?: Student }) {
  const router = useRouter();
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(student?.is_active ?? true);
  const cancel = student ? `/admin/students/${student.id}` : "/admin/students";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    if (!student && data.get("password") !== data.get("confirm_password")) { setError("Passwords do not match."); return; }
    const payload: Record<string, unknown> = { is_active: active };
    for (const field of ["name", "student_id", "email", "mobile", "college", "degree", "github", "linkedin"]) payload[field] = String(data.get(field) || "").trim();
    payload.year = Number(data.get("year"));
    payload.gender = data.get("gender") || null;
    if (!student) payload.password = data.get("password");
    setPending(true);
    setError("");
    try {
      const saved = await studentRequest<Student & CreatedAccount>(student ? String(student.id) : "", { method: student ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!student) setCreated(saved);
      else router.push(`/admin/students/${saved.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save student."); setPending(false); }
  }

  function field(name: keyof Student, label: string, maxLength: number, type = "text", required = true) {
    return <div className="min-w-0 space-y-2" key={name}><Label htmlFor={`student-${name}`} className="text-sm text-foreground">{label}{!required && " (optional)"}</Label><Input id={`student-${name}`} name={name} type={type} defaultValue={String(student?.[name] ?? "")} maxLength={maxLength} minLength={name === "mobile" ? 3 : undefined} required={required} disabled={pending} pattern={type === "url" ? "https://.*" : name === "mobile" ? String.raw`[+0-9\(\) .\-]+` : undefined} className="h-9 text-sm" /></div>;
  }

  if (created) return <AccountCreated account={created} resource="students" />;
  return <>
    <div className="flex items-center gap-3"><Button nativeButton={false} variant="outline" size="icon" className="size-9" title="Back" aria-label="Back" render={<Link href={cancel} />}><ArrowLeft className="size-4" /></Button><h1 className="text-lg font-semibold">{student ? "Edit student" : "Create student"}</h1></div>
    <form onSubmit={submit} className="space-y-5">
      <Card className={studentCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Personal details</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2">{field("name", "Full name", 150)}{field("student_id", "Student ID", 64)}{field("email", "Email address", 254, "email")}{field("mobile", "Mobile number", 30, "tel")}
        <div className="min-w-0 space-y-2"><Label htmlFor="student-gender" className="text-sm text-foreground">Gender (optional)</Label><Select name="gender" defaultValue={student?.gender ?? ""} items={genderOptions} disabled={pending}><SelectTrigger id="student-gender" className="h-9 w-full rounded-md text-foreground [&_svg]:text-foreground"><SelectValue /></SelectTrigger><SelectContent className="border border-border text-foreground">{genderOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        {field("github", "GitHub URL", 500, "url", false)}{field("linkedin", "LinkedIn URL", 500, "url", false)}</CardContent></Card>
      <Card className={studentCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="size-4 text-primary" />Education</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px]">{field("college", "College", 200)}{field("degree", "Degree", 150)}<div className="space-y-2"><Label htmlFor="student-year" className="text-sm">Academic year</Label><Input id="student-year" name="year" type="number" min={1} max={20} step={1} defaultValue={student?.year ?? 1} required disabled={pending} className="h-9 text-sm" /></div></CardContent></Card>
      <Card className={studentCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />Account access</CardTitle></CardHeader><CardContent className="space-y-5 p-5">{!student && <PasswordFields disabled={pending} />}<div className="flex items-center gap-3"><Checkbox id="student-active" checked={active} onCheckedChange={setActive} disabled={pending} /><Label htmlFor="student-active" className="text-sm text-foreground">Active account</Label></div></CardContent></Card>
      {error && <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm text-foreground">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" className="h-9" disabled={pending} onClick={() => router.push(cancel)}>Cancel</Button><Button type="submit" className="h-9" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Saving..." : student ? "Save changes" : "Create student"}</Button></div>
    </form>
  </>;
}