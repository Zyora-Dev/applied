"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, GraduationCap, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountPasswordField } from "@/components/account-password-field";
import { AdminStudentProgress } from "@/components/admin-student-progress";
import { useAdminRecords } from "@/lib/use-admin-records";

const COLLEGE = "Arunachala Hitech Engineering College";
const DEGREES = ["B.E", "B.Tech"];
const STREAMS = ["AI&DS", "ECE", "CSE", "EEE", "Mech", "Civil", "Others"];

type Student = {
  id: number; name: string; student_id: string; email: string; mobile: string;
  college: string; degree: string; stream: string; github_url: string | null;
  linkedin_url: string | null; created_at: string; updated_at: string; password_set: boolean;
};
type StudentList = { items: Student[]; total: number; page: number; page_size: number };
type Summary = { total: number; be: number; btech: number; streams: { stream: string; total: number }[] };

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="student-load-error" role="alert"><p>{message}</p><Button variant="outline" onClick={retry}><RefreshCw />Try again</Button></div>;
}

export function StudentOverview({ openStudents }: { openStudents: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data, error, loading } = useAdminRecords<Summary>("students/summary", revision);
  if (error) return <LoadError message={error} retry={() => setRevision(revision + 1)} />;
  return <div aria-busy={loading}>
    <div className="dashboard-stats">
      {[{ label: "Total students", value: data?.total, icon: Users }, { label: "B.E students", value: data?.be, icon: GraduationCap }, { label: "B.Tech students", value: data?.btech, icon: GraduationCap }].map(({ label, value, icon: Icon }) =>
        <article className="dashboard-stat" key={label}><div><span>{label}</span><Icon size={19} aria-hidden="true" /></div>
          {loading ? <div className="student-skeleton stat-skeleton" aria-label="Loading" /> : <strong>{value}</strong>}
        </article>)}
    </div>
    <section className="dashboard-section"><div className="section-heading"><h2>Students by stream</h2><Button variant="outline" onClick={openStudents}><Users />View students</Button></div>
      {loading ? <div className="student-skeleton h-32" /> : data?.total === 0 ? <div className="student-empty"><Users size={32} aria-hidden="true" /><h3>No students yet</h3><Button onClick={openStudents}><Plus />Add students</Button></div> :
        <div className="stream-breakdown">{data?.streams.map(item => <div className="stream-row" key={item.stream}><span>{item.stream}</span><div className="stream-track"><div style={{ width: `${item.total / data.total * 100}%` }} /></div><strong>{item.total}</strong></div>)}</div>}
    </section>
  </div>;
}

function ProfileLinks({ student }: { student: Student }) {
  return <div className="student-profile-links">
    {student.github_url && <a href={student.github_url} target="_blank" rel="noopener noreferrer">GitHub<ExternalLink size={13} aria-hidden="true" /></a>}
    {student.linkedin_url && <a href={student.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn<ExternalLink size={13} aria-hidden="true" /></a>}
    {!student.github_url && !student.linkedin_url && <span>Not provided</span>}
  </div>;
}

export function StudentForm({ student, saved, setBusy, selfRegistration = false }: {
  student: Student | null; saved: () => void; setBusy?: (busy: boolean) => void; selfRegistration?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [degree, setDegree] = useState(student?.degree ?? "");
  const [stream, setStream] = useState(student?.stream ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (selfRegistration && values.password !== values.confirm_password) {
      setError("Passwords do not match."); setFields({ confirm_password: "Passwords do not match." }); return;
    }
    delete values.confirm_password;
    if (student && !values.password) delete values.password;
    if (!degree || !stream) { setError("Select a degree and stream."); return; }
    setPending(true); setBusy?.(true); setError(""); setFields({});
    try {
      const response = await fetch(selfRegistration ? "/api/student/register" : `/api/admin/students${student ? `/${student.id}` : ""}`, {
        method: student ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, college: COLLEGE, degree, stream, github_url: values.github_url || null, linkedin_url: values.linkedin_url || null }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401) { window.location.replace(selfRegistration ? "/student/login" : "/admin/login"); return; }
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to save student."); setFields(body.fields ?? {}); return; }
      saved();
    } catch { setError(selfRegistration ? "Unable to confirm registration. Try signing in before registering again." : "Unable to save student. Please check your connection and try again."); }
    finally { setPending(false); setBusy?.(false); }
  }
  const textFields = [
    { name: "name", label: "Student name", type: "text", max: 150, value: student?.name, required: true, autoComplete: "name" },
    { name: "student_id", label: "Student ID", type: "text", max: 80, value: student?.student_id, required: true, autoComplete: "off" },
    { name: "email", label: "Email", type: "email", max: 320, value: student?.email, required: true, autoComplete: "email" },
    { name: "mobile", label: "Mobile", type: "tel", max: 30, value: student?.mobile, required: true, autoComplete: "tel" },
  ];
  return <form onSubmit={submit} className="student-form" aria-busy={pending}>
    <fieldset disabled={pending} className="student-form-grid">
      {textFields.map(field => <div className="field-group" key={field.name}><Label htmlFor={`student-${field.name}`}>{field.label}</Label>
        <Input id={`student-${field.name}`} name={field.name} type={field.type} maxLength={field.max} required={field.required}
          defaultValue={field.value ?? ""} autoComplete={field.autoComplete} aria-invalid={!!fields[field.name]} aria-describedby={fields[field.name] ? `error-${field.name}` : undefined} />
        {fields[field.name] && <p className="student-field-error" id={`error-${field.name}`}>{fields[field.name]}</p>}
      </div>)}
      <AccountPasswordField id="student-password" required={!student || !student.password_set} error={fields.password} disabled={pending} />
      {selfRegistration && <div className="field-group student-full-width">
        <Label htmlFor="student-confirm-password">Confirm password</Label>
        <Input id="student-confirm-password" name="confirm_password" type="password" required minLength={12} maxLength={1024}
          autoComplete="new-password" aria-invalid={!!fields.confirm_password} aria-describedby={fields.confirm_password ? "confirm-password-error" : undefined} />
        {fields.confirm_password && <p className="student-field-error" id="confirm-password-error">{fields.confirm_password}</p>}
      </div>}
      <div className="field-group student-full-width"><Label htmlFor="student-college">College</Label><Input id="student-college" value={COLLEGE} readOnly required /></div>
      <div className="field-group"><Label htmlFor="student-degree">Degree</Label><Select value={degree} onValueChange={setDegree} required disabled={pending}>
        <SelectTrigger id="student-degree" className="w-full" aria-invalid={!!fields.degree}><SelectValue placeholder="Select degree" /></SelectTrigger><SelectContent className={selfRegistration ? "student-auth-select" : undefined}>{DEGREES.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="field-group"><Label htmlFor="student-stream">Stream</Label><Select value={stream} onValueChange={setStream} required disabled={pending}>
        <SelectTrigger id="student-stream" className="w-full" aria-invalid={!!fields.stream}><SelectValue placeholder="Select stream" /></SelectTrigger><SelectContent className={selfRegistration ? "student-auth-select" : undefined}>{STREAMS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      {[{ name: "github_url", label: "GitHub link", value: student?.github_url }, { name: "linkedin_url", label: "LinkedIn link", value: student?.linkedin_url }].map(field => <div className="field-group student-full-width" key={field.name}>
        <Label htmlFor={`student-${field.name}`}>{field.label}<span className="optional-label">Optional</span></Label><Input id={`student-${field.name}`} name={field.name} type="url" maxLength={500} defaultValue={field.value ?? ""} placeholder="https://" aria-invalid={!!fields[field.name]} aria-describedby={fields[field.name] ? `error-${field.name}` : undefined} />
        {fields[field.name] && <p id={`error-${field.name}`} className="student-field-error">{fields[field.name]}</p>}
      </div>)}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="student-form-actions"><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : student ? <Pencil /> : <Plus />}{pending ? selfRegistration ? "Creating account..." : "Saving..." : selfRegistration ? "Create account" : student ? "Save changes" : "Add student"}</Button></div>
  </form>;
}

export function Students() {
  const [filters, setFilters] = useState({ search: "", date_from: "", date_to: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [progressTarget, setProgressTarget] = useState<Student | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const query = new URLSearchParams({ search: filters.search, page: String(filters.page), page_size: "10" });
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  const { data, error, loading } = useAdminRecords<StudentList>(`students?${query}`, revision);
  const filterActive = !!(filters.search || filters.date_from || filters.date_to);
  function edit(student: Student | null) { setSelected(student); setNotice(""); setDialogOpen(true); }
  function confirmDelete(student: Student) {
    setDeleteTarget(student); setDeleteError(""); setNotice("");
  }
  async function removeStudent() {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`/api/admin/students/${deleteTarget.id}`, {
        method: "DELETE", signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401) { window.location.replace("/admin/login"); return; }
      const body = await response.json();
      if (!response.ok) { setDeleteError(body.error ?? "Unable to delete student."); return; }
      setDeleteTarget(null); setRevision(value => value + 1);
      setNotice("Student deleted.");
      if (data?.items.length === 1) setFilters(value => ({ ...value, page: Math.max(1, value.page - 1) }));
    } catch { setDeleteError("Unable to confirm deletion. Refresh the list before trying again."); }
    finally { setDeleting(false); }
  }
  function saved() {
    setDialogOpen(false); setRevision(revision + 1);
    setNotice(selected ? "Student updated." : "Student added.");
    if (!selected) setFilters({ search: "", date_from: "", date_to: "", page: 1 });
  }
  return <section aria-label="Students">
    <div className="student-toolbar"><form className="student-search" onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      setFilters({ ...filters, search: String(values.get("search") ?? "").trim(), page: 1 });
    }} key={filters.search}>
      <Label htmlFor="student-search" className="sr-only">Search students</Label><Input id="student-search" name="search" placeholder="Search name, ID or email" defaultValue={filters.search} maxLength={150} /><Button type="submit" variant="outline" size="icon" aria-label="Search students" title="Search students"><Search /></Button>
    </form><Button onClick={() => edit(null)}><Plus />Add student</Button></div>
    <div className="student-filters"><span>Added date (IST)</span><div><Label htmlFor="student-date-from">From</Label><Input type="date" id="student-date-from" value={filters.date_from} max={filters.date_to || undefined} onChange={event => setFilters({ ...filters, date_from: event.target.value, page: 1 })} /></div>
      <div><Label htmlFor="student-date-to">To</Label><Input type="date" id="student-date-to" value={filters.date_to} min={filters.date_from || undefined} onChange={event => setFilters({ ...filters, date_to: event.target.value, page: 1 })} /></div>
      {filterActive && <Button variant="ghost" onClick={() => setFilters({ search: "", date_from: "", date_to: "", page: 1 })}>Clear filters</Button>}
    </div>
    {notice && <p className="student-notice" role="status">{notice}</p>}
    {error ? <LoadError message={error} retry={() => setRevision(revision + 1)} /> : loading ? <div className="student-loading" role="status" aria-label="Loading students">{[1, 2, 3, 4].map(row => <div className="student-skeleton h-16" key={row} />)}</div> : data?.items.length === 0 ?
      <div className="student-empty"><Users size={32} aria-hidden="true" /><h3>{filterActive ? "No matching students" : "No students yet"}</h3>
        {filterActive ? <Button variant="outline" onClick={() => setFilters({ search: "", date_from: "", date_to: "", page: 1 })}>Clear filters</Button> : <Button onClick={() => edit(null)}><Plus />Add student</Button>}
      </div> : <>
      <div className="student-table-scroll"><table className="student-table"><caption className="sr-only">Registered students</caption><thead><tr><th>Student</th><th>Contact</th><th>College</th><th>Degree / Stream</th><th>Profiles</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data?.items.map(student => <tr key={student.id}><td><strong>{student.name}</strong><span>{student.student_id}</span></td><td><a href={`mailto:${student.email}`}>{student.email}</a><a href={`tel:${student.mobile}`}>{student.mobile}</a></td><td>{student.college}</td><td><strong>{student.degree}</strong><span>{student.stream}</span></td><td><ProfileLinks student={student} /></td><td><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Weekly progress for ${student.name}`} title={`Weekly progress for ${student.name}`} onClick={() => setProgressTarget(student)}><BookOpen /></Button><Button variant="ghost" size="icon" aria-label={`Edit ${student.name}`} title={`Edit ${student.name}`} onClick={() => edit(student)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${student.name}`} title={`Delete ${student.name}`} onClick={() => confirmDelete(student)}><Trash2 /></Button></div></td></tr>)}</tbody></table></div>
      <div className="student-mobile-list">{data?.items.map(student => <article key={student.id} className="student-mobile-record"><div className="student-record-heading"><div><h3>{student.name}</h3><span>{student.student_id}</span></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" aria-label={`Weekly progress for ${student.name}`} title={`Weekly progress for ${student.name}`} onClick={() => setProgressTarget(student)}><BookOpen /></Button><Button variant="ghost" size="icon" aria-label={`Edit ${student.name}`} title={`Edit ${student.name}`} onClick={() => edit(student)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${student.name}`} title={`Delete ${student.name}`} onClick={() => confirmDelete(student)}><Trash2 /></Button></div></div>
        <dl><div><dt>Email</dt><dd><a href={`mailto:${student.email}`}>{student.email}</a></dd></div><div><dt>Mobile</dt><dd><a href={`tel:${student.mobile}`}>{student.mobile}</a></dd></div><div><dt>College</dt><dd>{student.college}</dd></div><div><dt>Degree</dt><dd>{student.degree}</dd></div><div><dt>Stream</dt><dd>{student.stream}</dd></div></dl><ProfileLinks student={student} /></article>)}</div>
    </>}
    {data && data.total > 0 && <div className="student-pagination"><span>{(data.page - 1) * data.page_size + 1}-{Math.min(data.page * data.page_size, data.total)} of {data.total} students</span><div>
      <Button variant="outline" size="icon" aria-label="Previous page" title="Previous page" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ArrowLeft /></Button>
      <span>Page {data.page} of {Math.ceil(data.total / data.page_size)}</span><Button variant="outline" size="icon" aria-label="Next page" title="Next page" disabled={filters.page * data.page_size >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}><ArrowRight /></Button>
    </div></div>}
    <Dialog open={progressTarget !== null} onOpenChange={open => { if (!open && !progressBusy) setProgressTarget(null); }}>
      <DialogContent className="student-dialog" showCloseButton={!progressBusy} onEscapeKeyDown={event => { if (progressBusy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>Weekly progress</DialogTitle><DialogDescription className="text-white">{progressTarget?.name} / {progressTarget?.student_id}</DialogDescription></DialogHeader>
        {progressTarget && <AdminStudentProgress key={progressTarget.id} studentId={progressTarget.id} setBusy={setProgressBusy} />}
      </DialogContent>
    </Dialog>
    <Dialog open={deleteTarget !== null} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
      <DialogContent className="student-dialog" showCloseButton={!deleting} onEscapeKeyDown={event => { if (deleting) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>Delete student?</DialogTitle><DialogDescription className="break-words text-white">
          Permanently delete {deleteTarget?.name} ({deleteTarget?.student_id})? This cannot be undone.
        </DialogDescription></DialogHeader>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <div className="flex flex-wrap justify-end gap-3" aria-busy={deleting}>
          <Button variant="outline" autoFocus disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" disabled={deleting} onClick={removeStudent}>{deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{deleting ? "Deleting..." : "Delete student"}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={dialogOpen} onOpenChange={open => { if (!busy) setDialogOpen(open); }}><DialogContent className="student-dialog" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader><DialogTitle>{selected ? "Edit student" : "Add student"}</DialogTitle><DialogDescription className="sr-only">Student contact, academic details and optional profile links.</DialogDescription></DialogHeader>
      <StudentForm student={selected} saved={saved} setBusy={setBusy} />
    </DialogContent></Dialog>
  </section>;
}