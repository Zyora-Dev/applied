"use client";

import { useState } from "react";
import { LoaderCircle, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { courseWeeks, progressLabels, type CourseProgress, type WeekStatus } from "@/lib/course-weeks";
import { useAdminRecords } from "@/lib/use-admin-records";

export function AdminStudentProgress({ studentId, setBusy }: { studentId: number; setBusy: (busy: boolean) => void }) {
  const [revision, setRevision] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<number, WeekStatus>>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { data, loading, error: loadError } = useAdminRecords<CourseProgress>(`students/${studentId}/progress`, revision);

  async function save(week: number, status: WeekStatus) {
    if (saving !== null) return;
    setSaving(week); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/students/${studentId}/progress/${week}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }), signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401) { window.location.replace("/admin/login"); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update progress.");
      setDrafts(current => { const next = { ...current }; delete next[week]; return next; });
      setNotice(`Week ${week} marked ${progressLabels[status].toLowerCase()}.`);
      setRevision(value => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to confirm the update. Reload progress before trying again.");
    } finally { setSaving(null); setBusy(false); }
  }

  return <div className="admin-week-progress" aria-busy={loading || saving !== null}>
    {notice && <p className="student-notice" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loadError ? <div className="student-load-error" role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}><RefreshCw />Retry</Button></div>
      : loading ? <div role="status" aria-label="Loading weekly progress" className="space-y-4">{courseWeeks.map(week => <div key={week.title} className="student-skeleton h-24" />)}</div>
        : data && <>
          <p>{data.weeks.filter(week => week.status === "completed").length} of 4 weeks completed</p>
          {data.weeks.map(progress => {
            const status = drafts[progress.week] ?? progress.status;
            return <form key={progress.week} className="admin-week-row" onSubmit={event => { event.preventDefault(); void save(progress.week, status); }}>
              <div className="admin-week-heading"><h3>Week {progress.week}: {courseWeeks[progress.week - 1].title}</h3><span>{progressLabels[progress.status]}</span></div>
              <div className="admin-week-controls"><div className="field-group"><Label htmlFor={`week-status-${progress.week}`}>Status</Label><Select value={status} disabled={saving !== null} onValueChange={value => setDrafts(current => ({ ...current, [progress.week]: value as WeekStatus }))}>
                <SelectTrigger id={`week-status-${progress.week}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(progressLabels).map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent>
              </Select></div><Button type="submit" disabled={saving !== null || status === progress.status} aria-label={`Save Week ${progress.week} status`}>{saving === progress.week ? <LoaderCircle className="animate-spin" /> : <Check />}{saving === progress.week ? "Saving..." : "Save status"}</Button></div>
              {progress.updated_at && <p>Updated {new Date(progress.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
            </form>;
          })}
        </>}
  </div>;
}