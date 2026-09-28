"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, LoaderCircle, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountPasswordField } from "@/components/account-password-field";
import { useAdminRecords } from "@/lib/use-admin-records";

const ROLES = ["HOD", "Professor", "Asst. Professor", "Principal", "Director"];
type FacultyRecord = { id: number; name: string | null; role: string | null; email: string; is_active: boolean; created_at: string; updated_at: string };
type FacultyList = { items: FacultyRecord[]; total: number; page: number; page_size: number };
const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function FacultyForm({ faculty, saved, setBusy }: { faculty: FacultyRecord | null; saved: () => void; setBusy: (busy: boolean) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [role, setRole] = useState(faculty?.role ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") ?? "");
    if (!role) { setFields({ role: "Select a role." }); return; }
    setPending(true); setBusy(true); setError(""); setFields({});
    try {
      const response = await fetch(`/api/admin/faculty${faculty ? `/${faculty.id}` : ""}`, {
        method: faculty ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.get("name"), role, email: values.get("email"), is_active: values.has("is_active"), ...(password ? { password } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401) { window.location.replace("/admin/login"); return; }
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to save faculty."); setFields(result.fields ?? {}); return; }
      saved();
    } catch { setError("Unable to save faculty. Please check your connection and try again."); }
    finally { setPending(false); setBusy(false); }
  }
  return <form className="student-form" onSubmit={submit} aria-busy={pending}>
    <fieldset className="student-form-grid" disabled={pending}>
      <div className="field-group"><Label htmlFor="faculty-name">Faculty name</Label>
        <Input id="faculty-name" name="name" required maxLength={150} autoComplete="name" defaultValue={faculty?.name ?? ""}
          aria-invalid={!!fields.name} aria-describedby={fields.name ? "faculty-name-error" : undefined} />
        {fields.name && <p className="student-field-error" id="faculty-name-error">{fields.name}</p>}
      </div>
      <div className="field-group"><Label htmlFor="faculty-role">Role</Label>
        <Select value={role} onValueChange={setRole} required disabled={pending}>
          <SelectTrigger id="faculty-role" className="w-full" aria-invalid={!!fields.role} aria-describedby={fields.role ? "faculty-role-error" : undefined}><SelectValue placeholder="Select role" /></SelectTrigger>
          <SelectContent>{ROLES.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
        </Select>
        {fields.role && <p className="student-field-error" id="faculty-role-error">{fields.role}</p>}
      </div>
      <div className="field-group student-full-width"><Label htmlFor="faculty-email">Email</Label>
        <Input id="faculty-email" name="email" type="email" required maxLength={320} autoComplete="off" defaultValue={faculty?.email ?? ""}
          aria-invalid={!!fields.email} aria-describedby={fields.email ? "faculty-email-error" : undefined} />
        {fields.email && <p className="student-field-error" id="faculty-email-error">{fields.email}</p>}
      </div>
      <AccountPasswordField id="faculty-password" required={!faculty} error={fields.password} disabled={pending} />
      <div className="faculty-active student-full-width"><input id="faculty-active" name="is_active" type="checkbox" defaultChecked={faculty?.is_active ?? true} /><Label htmlFor="faculty-active">Active account</Label></div>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="student-form-actions"><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : faculty ? <Pencil /> : <Plus />}{pending ? "Saving..." : faculty ? "Save changes" : "Add faculty"}</Button></div>
  </form>;
}

export function Faculty() {
  const [filters, setFilters] = useState({ search: "", date_from: "", date_to: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<FacultyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ search: filters.search, page: String(filters.page), page_size: "10" });
  if (filters.date_from) query.set("date_from", filters.date_from);
  if (filters.date_to) query.set("date_to", filters.date_to);
  const { data, error, loading } = useAdminRecords<FacultyList>(`faculty?${query}`, revision);
  const filterActive = !!(filters.search || filters.date_from || filters.date_to);
  function clearFilters() { setFilters({ search: "", date_from: "", date_to: "", page: 1 }); }
  function edit(faculty: FacultyRecord | null) { setSelected(faculty); setNotice(""); setDialogOpen(true); }
  function saved() {
    setDialogOpen(false); setRevision(revision + 1); setNotice(selected ? "Faculty account updated." : "Faculty account added.");
    if (!selected) clearFilters();
  }
  return <section aria-label="Faculty">
    <div className="student-toolbar"><form className="student-search" key={filters.search} onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      setFilters({ ...filters, search: String(values.get("search") ?? "").trim(), page: 1 });
    }}><Label htmlFor="faculty-search" className="sr-only">Search faculty</Label><Input id="faculty-search" name="search" placeholder="Search name, email or role" defaultValue={filters.search} maxLength={150} />
      <Button type="submit" variant="outline" size="icon" aria-label="Search faculty" title="Search faculty"><Search /></Button>
    </form><Button onClick={() => edit(null)}><Plus />Add faculty</Button></div>
    <div className="student-filters"><span>Added date (IST)</span>
      <div><Label htmlFor="faculty-date-from">From</Label><Input id="faculty-date-from" type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={event => setFilters({ ...filters, date_from: event.target.value, page: 1 })} /></div>
      <div><Label htmlFor="faculty-date-to">To</Label><Input id="faculty-date-to" type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={event => setFilters({ ...filters, date_to: event.target.value, page: 1 })} /></div>
      {filterActive && <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>}
    </div>
    {notice && <p className="student-notice" role="status">{notice}</p>}
    {error ? <div className="student-load-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRevision(revision + 1)}><RefreshCw />Try again</Button></div> : loading ?
      <div className="student-loading" role="status" aria-label="Loading faculty">{[1, 2, 3, 4].map(row => <div className="student-skeleton h-16" key={row} />)}</div> : data?.items.length === 0 ?
      <div className="student-empty"><GraduationCap size={32} aria-hidden="true" /><h3>{filterActive ? "No matching faculty" : "No faculty yet"}</h3>
        {filterActive ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : <Button onClick={() => edit(null)}><Plus />Add faculty</Button>}
      </div> : <>
        <div className="student-table-scroll"><table className="student-table faculty-table"><caption className="sr-only">Faculty accounts</caption><thead><tr><th>Faculty</th><th>Role</th><th>Status</th><th>Added (IST)</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data?.items.map(faculty => <tr key={faculty.id}><td><strong>{faculty.name ?? "Name not set"}</strong><a href={`mailto:${faculty.email}`}>{faculty.email}</a></td><td>{faculty.role ?? "Not set"}</td><td><span className={`faculty-status ${faculty.is_active ? "is-active" : ""}`}>{faculty.is_active ? "Active" : "Inactive"}</span></td><td>{dateFormatter.format(new Date(faculty.created_at))}</td>
            <td><Button variant="ghost" size="icon" aria-label={`Edit ${faculty.email}`} title={`Edit ${faculty.email}`} onClick={() => edit(faculty)}><Pencil /></Button></td></tr>)}</tbody>
        </table></div>
        <div className="student-mobile-list">{data?.items.map(faculty => <article className="student-mobile-record" key={faculty.id}><div className="student-record-heading"><div><h3>{faculty.name ?? "Name not set"}</h3><span className={`faculty-status ${faculty.is_active ? "is-active" : ""}`}>{faculty.is_active ? "Active" : "Inactive"}</span></div>
          <Button variant="ghost" size="icon" aria-label={`Edit ${faculty.email}`} title={`Edit ${faculty.email}`} onClick={() => edit(faculty)}><Pencil /></Button></div>
          <dl><div><dt>Email</dt><dd><a href={`mailto:${faculty.email}`}>{faculty.email}</a></dd></div><div><dt>Role</dt><dd>{faculty.role ?? "Not set"}</dd></div><div><dt>Added</dt><dd>{dateFormatter.format(new Date(faculty.created_at))}</dd></div></dl>
        </article>)}</div>
      </>}
    {data && data.total > 0 && <div className="student-pagination"><span>{(data.page - 1) * data.page_size + 1}-{Math.min(data.page * data.page_size, data.total)} of {data.total} faculty</span><div>
      <Button variant="outline" size="icon" aria-label="Previous page" title="Previous page" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ArrowLeft /></Button><span>Page {data.page} of {Math.ceil(data.total / data.page_size)}</span>
      <Button variant="outline" size="icon" aria-label="Next page" title="Next page" disabled={filters.page * data.page_size >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}><ArrowRight /></Button>
    </div></div>}
    <Dialog open={dialogOpen} onOpenChange={open => { if (!busy) setDialogOpen(open); }}><DialogContent className="student-dialog" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader><DialogTitle>{selected ? "Edit faculty" : "Add faculty"}</DialogTitle><DialogDescription className="sr-only">Faculty name, role, email, password and account status.</DialogDescription></DialogHeader>
      <FacultyForm faculty={selected} saved={saved} setBusy={setBusy} />
    </DialogContent></Dialog>
  </section>;
}