"use client";
import { AccountCreated, type CreatedAccount } from "@/components/account-created";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Ellipsis, Eye, GraduationCap, KeyRound, LoaderCircle, Pencil, Plus, RotateCcw, Save, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { type Faculty, type FacultyListResult, type FacultyRole, facultyCard, facultyDate, facultyRequest, facultyRoles } from "@/lib/faculty";
import { PasswordFields } from "@/components/student-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const roleOptions = facultyRoles.map((role) => ({ label: role, value: role }));

function Status({ active }: { active: boolean }) {
  return <Badge variant="outline" className={`h-6 rounded-md px-2 text-xs ${active ? "border-primary/40 text-primary" : "border-border text-foreground"}`}>{active ? "Active" : "Inactive"}</Badge>;
}

function Loading() {
  return <div role="status" aria-label="Loading faculty" className="space-y-4"><span className="sr-only">Loading faculty...</span>{[1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-14 w-full rounded-md" />)}</div>;
}

function Failure({ error, retry }: { error: string; retry: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/50 p-4"><p role="alert" className="text-sm text-foreground">{error}</p><Button variant="outline" className="h-9" onClick={retry}><RotateCcw className="size-4" />Retry</Button></div>;
}

function FacultyActions({ member, onChanged, onDeleted }: { member: Faculty; onChanged: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const [action, setAction] = useState<"delete" | "password" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function open(next: "delete" | "password") { setError(""); setNotice(""); setAction(next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (action === "password" && data.get("password") !== data.get("confirm_password")) { setError("Passwords do not match."); return; }
    setError(""); setPending(true);
    try {
      if (action === "delete") {
        await facultyRequest(String(member.id), { method: "DELETE" });
        setAction(null); onDeleted();
      } else {
        await facultyRequest(`${member.id}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: data.get("password") }) });
        form.reset(); setNotice("Password reset successfully."); onChanged();
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to complete the request."); }
    finally { setPending(false); }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="size-9 shrink-0" title={`Actions for ${member.name}`} aria-label={`Actions for ${member.name}`} />}><Ellipsis className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 border border-border">
        <DropdownMenuItem className="min-h-9" onClick={() => router.push(`/admin/faculty/${member.id}`)}><Eye />View faculty</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9" onClick={() => router.push(`/admin/faculty/${member.id}/edit`)}><Pencil />Edit faculty</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9" onClick={() => open("password")}><KeyRound />Reset password</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-9" variant="destructive" onClick={() => open("delete")}><Trash2 />Delete faculty</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={action !== null} onOpenChange={(isOpen) => { if (!isOpen && !pending) setAction(null); }}>
      <DialogContent showCloseButton={!pending} className="max-h-[90svh] overflow-y-auto rounded-lg border border-border sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader><DialogTitle>{action === "delete" ? "Delete faculty" : "Reset password"}</DialogTitle><DialogDescription className="break-words text-foreground">{action === "delete" ? `${member.name} will be deactivated and removed from the faculty list. Their record will be retained.` : `${member.name} (${member.role})`}</DialogDescription></DialogHeader>
          {action === "password" && !notice && <PasswordFields disabled={pending} />}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          <DialogFooter><Button type="button" variant="outline" className="h-9" disabled={pending} onClick={() => setAction(null)}>{notice ? "Done" : "Cancel"}</Button>{!notice && <Button type="submit" variant={action === "delete" ? "destructive" : "default"} className="h-9" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : action === "delete" ? <Trash2 className="size-4" /> : <KeyRound className="size-4" />}{action === "delete" ? "Delete faculty" : "Reset password"}</Button>}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

export function FacultyList() {
  const [query, setQuery] = useState("page=1&page_size=20");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<FacultyListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    facultyRequest<FacultyListResult>(`?${query}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setResult(data); setError(""); setLoading(false); }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Unable to load faculty."); setLoading(false); } });
    return () => controller.abort();
  }, [query, revision]);

  function reload() { setLoading(true); setRevision((value) => value + 1); }
  function deleted() {
    const params = new URLSearchParams(query);
    if (result?.items.length === 1 && result.page > 1) { params.set("page", String(result.page - 1)); setQuery(params.toString()); }
    reload();
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("date_from") || "");
    const to = String(data.get("date_to") || "");
    if (from && to && from > to) { setError("Start date must not be after end date."); return; }
    const params = new URLSearchParams({ page: "1", page_size: "20" });
    for (const field of ["search", "date_from", "date_to"]) { const value = String(data.get(field) || "").trim(); if (value) params.set(field, value); }
    setQuery(params.toString()); reload();
  }
  function goTo(page: number) { const params = new URLSearchParams(query); params.set("page", String(page)); setLoading(true); setQuery(params.toString()); }

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><h1 className="text-lg font-semibold">Faculty</h1>{result && <Badge variant="outline" className="rounded-md text-sm tabular-nums">{result.total}</Badge>}</div>
      <Button nativeButton={false} render={<Link href="/admin/faculty/new" />} className="h-9"><Plus className="size-4" />Create faculty</Button>
    </div>
    <form onSubmit={filter} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_160px_160px_auto]">
      <div className="space-y-2"><Label htmlFor="faculty-search" className="text-sm">Search</Label><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4" /><Input id="faculty-search" name="search" placeholder="Name, email or role" maxLength={100} className="h-9 pl-9 text-sm" /></div></div>
      <div className="space-y-2"><Label htmlFor="faculty-from" className="text-sm">Created from</Label><Input id="faculty-from" name="date_from" type="date" max="9998-12-31" className="h-9 min-w-0 text-sm [color-scheme:dark]" /></div>
      <div className="space-y-2"><Label htmlFor="faculty-to" className="text-sm">Created to</Label><Input id="faculty-to" name="date_to" type="date" max="9998-12-31" className="h-9 min-w-0 text-sm [color-scheme:dark]" /></div>
      <div className="flex gap-2"><Button type="submit" variant="outline" className="h-9" disabled={loading}><Search className="size-4" />Apply</Button><Button type="reset" variant="outline" size="icon" className="size-9" title="Clear filters" aria-label="Clear filters" disabled={loading} onClick={() => { setQuery("page=1&page_size=20"); reload(); }}><RotateCcw className="size-4" /></Button></div>
    </form>
    {error && <Failure error={error} retry={reload} />}
    {loading ? <Loading /> : !error && result && <>
      {result.items.length === 0 ? <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-5 py-14 text-center"><GraduationCap className="size-8 text-primary" /><h2 className="text-base font-semibold">{result.total ? "No faculty on this page" : "No faculty found"}</h2><Button nativeButton={false} render={<Link href="/admin/faculty/new" />} className="h-9"><Plus className="size-4" />Create faculty</Button></div> : <>
        <div className="hidden overflow-hidden rounded-lg border border-border bg-[#111111] lg:block"><Table>
          <TableHeader><TableRow className="bg-background"><TableHead className="px-5 py-3 text-foreground">Faculty member</TableHead><TableHead className="text-foreground">Role</TableHead><TableHead className="text-foreground">Email</TableHead><TableHead className="text-foreground">Status</TableHead><TableHead className="text-foreground">Created</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{result.items.map((member) => <TableRow key={member.id}>
            <TableCell className="max-w-60 px-5 py-4"><Link href={`/admin/faculty/${member.id}`} className="block truncate font-medium hover:text-primary hover:underline" title={member.name}>{member.name}</Link></TableCell>
            <TableCell>{member.role}</TableCell><TableCell className="max-w-60"><p className="truncate" title={member.email}>{member.email}</p></TableCell><TableCell><Status active={member.is_active} /></TableCell><TableCell className="tabular-nums">{facultyDate(member.created_at)}</TableCell><TableCell className="pr-4"><FacultyActions member={member} onChanged={() => {}} onDeleted={deleted} /></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:hidden">{result.items.map((member) => <Card key={member.id} className={facultyCard}><CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/admin/faculty/${member.id}`} className="text-sm font-semibold break-words hover:text-primary hover:underline">{member.name}</Link><p className="mt-1 text-sm">{member.role}</p></div><FacultyActions member={member} onChanged={() => {}} onDeleted={deleted} /></div>
          <p className="text-sm break-all">{member.email}</p><div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><Status active={member.is_active} /><span className="text-sm tabular-nums">{facultyDate(member.created_at)}</span></div>
        </CardContent></Card>)}</div>
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="tabular-nums">{result.total === 0 ? "0 faculty" : `${(result.page - 1) * result.page_size + 1}-${Math.min(result.page * result.page_size, result.total)} of ${result.total} faculty`}</p><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="size-9" title="Previous page" aria-label="Previous page" disabled={result.page <= 1} onClick={() => goTo(result.page - 1)}><ChevronLeft className="size-4" /></Button><span className="tabular-nums">{result.page} / {Math.max(1, Math.ceil(result.total / result.page_size))}</span><Button variant="outline" size="icon" className="size-9" title="Next page" aria-label="Next page" disabled={result.page * result.page_size >= result.total} onClick={() => goTo(result.page + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </>}
  </>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><dt className="text-sm text-foreground">{label}</dt><dd className="text-sm font-medium break-words [overflow-wrap:anywhere]">{children}</dd></div>;
}

export function FacultyPage({ id, edit = false }: { id: string; edit?: boolean }) {
  const router = useRouter();
  const [member, setMember] = useState<Faculty | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    facultyRequest<Faculty>(id, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) { setMember(data); setError(""); } }).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load faculty."); });
    return () => controller.abort();
  }, [id, revision]);
  if (error) return <><Button nativeButton={false} variant="outline" render={<Link href="/admin/faculty" />} className="h-9"><ArrowLeft className="size-4" />Faculty</Button><Failure error={error} retry={() => { setError(""); setRevision((value) => value + 1); }} /></>;
  if (!member) return <Loading />;
  if (edit) return <FacultyForm member={member} />;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Button nativeButton={false} variant="outline" size="icon" className="size-9 shrink-0" title="Back to faculty" aria-label="Back to faculty" render={<Link href="/admin/faculty" />}><ArrowLeft className="size-4" /></Button><h1 className="text-lg font-semibold">Faculty profile</h1></div><div className="flex gap-2"><Button nativeButton={false} variant="outline" className="h-9" render={<Link href={`/admin/faculty/${id}/edit`} />}><Pencil className="size-4" />Edit faculty</Button><FacultyActions member={member} onChanged={() => setRevision((value) => value + 1)} onDeleted={() => router.push("/admin/faculty")} /></div></div>
    <Card className={facultyCard}><CardHeader className="border-b border-border p-5"><div className="flex flex-wrap items-center gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10"><GraduationCap className="size-5 text-primary" /></span><div className="min-w-0 flex-1"><h2 className="text-base font-semibold break-words">{member.name}</h2><p className="mt-1 text-sm">{member.role}</p></div><Status active={member.is_active} /></div></CardHeader><CardContent className="p-5"><dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2"><Detail label="Email address">{member.email}</Detail><Detail label="Role">{member.role}</Detail></dl></CardContent></Card>
    <Card className={facultyCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />Account details</CardTitle></CardHeader><CardContent className="p-5"><dl className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4"><Detail label="Account ID">#{member.id}</Detail><Detail label="Status">{member.is_active ? "Active" : "Inactive"}</Detail><Detail label="Created on">{facultyDate(member.created_at)}</Detail><Detail label="Last updated">{facultyDate(member.updated_at)}</Detail></dl></CardContent></Card>
  </>;
}

export function FacultyForm({ member }: { member?: Faculty }) {
  const router = useRouter();
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(member?.is_active ?? true);
  const [role, setRole] = useState<FacultyRole | null>(member && facultyRoles.includes(member.role) ? member.role : null);
  const cancel = member ? `/admin/faculty/${member.id}` : "/admin/faculty";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    if (!role) { setError("Select a role."); return; }
    if (!member && data.get("password") !== data.get("confirm_password")) { setError("Passwords do not match."); return; }
    const payload = { name: String(data.get("name") || "").trim(), email: String(data.get("email") || "").trim(), role, is_active: active, ...(!member ? { password: data.get("password") } : {}) };
    setPending(true); setError("");
    try {
      const saved = await facultyRequest<Faculty & CreatedAccount>(member ? String(member.id) : "", { method: member ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!member) setCreated(saved);
      else router.push(`/admin/faculty/${saved.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save faculty."); setPending(false); }
  }

  if (created) return <AccountCreated account={created} resource="faculty" />;
  return <>
    <div className="flex items-center gap-3"><Button nativeButton={false} variant="outline" size="icon" className="size-9" title="Back" aria-label="Back" render={<Link href={cancel} />}><ArrowLeft className="size-4" /></Button><h1 className="text-lg font-semibold">{member ? "Edit faculty" : "Create faculty"}</h1></div>
    <form onSubmit={submit} className="space-y-5">
      <Card className={facultyCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" />Faculty details</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="faculty-name" className="text-sm text-foreground">Full name</Label><Input id="faculty-name" name="name" defaultValue={member?.name ?? ""} maxLength={150} required disabled={pending} className="h-9 text-sm" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="faculty-email" className="text-sm text-foreground">Email address</Label><Input id="faculty-email" name="email" type="email" defaultValue={member?.email ?? ""} maxLength={254} required disabled={pending} className="h-9 text-sm" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="faculty-role" className="text-sm text-foreground">Role</Label><Select<FacultyRole> name="role" required value={role} onValueChange={setRole} items={roleOptions} disabled={pending}><SelectTrigger id="faculty-role" className="w-full rounded-md text-sm data-[size=default]:h-9 [&_svg]:text-foreground"><SelectValue placeholder="Select role" /></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false} className="border border-border"><SelectItem value="Principal" className="min-h-9">Principal</SelectItem><SelectItem value="HOD" className="min-h-9">HOD</SelectItem><SelectItem value="Professor" className="min-h-9">Professor</SelectItem><SelectItem value="Asst. Professor" className="min-h-9">Asst. Professor</SelectItem></SelectContent></Select></div>
      </CardContent></Card>
      <Card className={facultyCard}><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />Account access</CardTitle></CardHeader><CardContent className="space-y-5 p-5">{!member && <PasswordFields disabled={pending} />}<div className="flex items-center gap-3"><Checkbox id="faculty-active" checked={active} onCheckedChange={setActive} disabled={pending} /><Label htmlFor="faculty-active" className="text-sm text-foreground">Active account</Label></div></CardContent></Card>
      {error && <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm text-foreground">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" className="h-9" disabled={pending} onClick={() => router.push(cancel)}>Cancel</Button><Button type="submit" className="h-9" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Saving..." : member ? "Save changes" : "Create faculty"}</Button></div>
    </form>
  </>;
}