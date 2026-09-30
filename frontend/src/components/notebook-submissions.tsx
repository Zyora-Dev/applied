"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { GoogleDriveConnection } from "@/components/google-drive-connection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { NotebookSelection } from "@/lib/google-picker";
import { parseReceipt, type SubmissionHistory, type SubmissionReceipt, type SubmissionKind } from "@/lib/submissions";

function submittedTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function DownloadButton({ receipt }: { receipt: SubmissionReceipt }) {
  return <Button nativeButton={false} render={<a href={`/api/student/submissions/${receipt.week}/${receipt.id}/download`} />}
    variant="outline" size="icon" aria-label={`Download saved ${receipt.filename}`} title="Download saved notebook"><Download aria-hidden="true" /></Button>;
}

export function NotebookSubmissions({ week }: { week: number }) {
  const [selected, setSelected] = useState<NotebookSelection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const [historyResult, setHistoryResult] = useState<{ key: string; data?: SubmissionHistory; error?: string } | null>(null);
  const [page, setPage] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [revision, setRevision] = useState(0);
  const attempt = useRef<{ file_id: string; request_id: string } | null>(null);
  const submissionRequest = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<SubmissionKind>("homework");
  const historyKey = JSON.stringify([week, kind, page, start, end, revision]);
  const history = historyResult?.key === historyKey ? historyResult.data : null;
  const historyError = historyResult?.key === historyKey ? historyResult.error : "";

  useEffect(() => () => submissionRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams({ page: String(page), kind, ...(start ? { start } : {}), ...(end ? { end } : {}) });
        const response = await fetch(`/api/student/submissions/${week}?${query}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (controller.signal.aborted) return;
        if (response.status === 401) { window.location.replace("/student/login"); return; }
        if (response.status === 403) { window.location.replace("/student/programme"); return; }
        if (!response.ok) throw new Error();
        const result: SubmissionHistory = await response.json();
        if (!controller.signal.aborted) setHistoryResult({ key: historyKey, data: result });
      } catch {
        if (!controller.signal.aborted) setHistoryResult({ key: historyKey, error: start && end && start > end ? "Start date must not be after end date." : "Unable to load submission history." });
      }
    }
    void load();
    return () => controller.abort();
  }, [week, kind, page, start, end, historyKey]);

  function selectionChanged(notebook: NotebookSelection | null) {
    setSelected(notebook);
    attempt.current = null;
    setReceipt(null);
    setError("");
  }

  async function submit() {
    if (!selected || pending || submissionRequest.current || receipt) return;
    const controller = new AbortController();
    submissionRequest.current = controller;
    if (!attempt.current) attempt.current = { file_id: selected.id, request_id: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/student/submissions/${week}`, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...attempt.current, kind }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]) });
      if (controller.signal.aborted) return;
      if (response.status === 401) { window.location.replace("/student/login"); return; }
      if (response.status === 403) { window.location.replace("/student/programme"); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Submission could not be confirmed. Check history and retry.");
      const saved = parseReceipt(result, week);
      if (saved.kind && saved.kind !== kind) throw new Error("Submission type could not be confirmed. Check history.");
      if (!controller.signal.aborted) {
        setReceipt(saved);
        setPage(1); setStart(""); setEnd(""); setRevision(value => value + 1);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.name === "Error" ? failure.message : "Submission could not be confirmed. Retry to check the same attempt.");
    } finally {
      submissionRequest.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <section aria-labelledby="submission-heading" className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-6">
      <h2 id="submission-heading" className="text-lg font-semibold">Submission</h2>
      <span className="text-sm text-white">.ipynb / 2 MiB maximum</span>
    </div>
    <div role="group" aria-label="Submission type" className="flex w-fit gap-1 rounded-md border border-white/25 p-1">
      {(["practical", "homework"] as const).map(value => <Button key={value} type="button" variant={kind === value ? "default" : "ghost"} aria-pressed={kind === value} disabled={pending} onClick={() => {
        if (value === kind) return;
        setKind(value); selectionChanged(null); setPage(1); setStart(""); setEnd("");
      }}>{value === "practical" ? "Practical" : "Homework"}</Button>)}
    </div>
    <GoogleDriveConnection key={kind} onNotebookChange={selectionChanged} selectionDisabled={pending} submitted={Boolean(receipt)} />
    <div className="space-y-3">
      <Button type="button" onClick={submit} disabled={!selected || pending || Boolean(receipt)}>
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : receipt ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}
        {pending ? "Saving notebook..." : receipt ? "Submitted" : "Submit notebook"}
      </Button>
      {error && <p role="alert" className="text-sm text-white">{error}</p>}
    </div>
    {receipt && <section aria-label="Submission receipt" role="status" className="space-y-3 border-y border-white/20 py-5">
      <div className="flex items-center justify-between gap-4"><h3 className="flex items-center gap-2 font-medium"><Check aria-hidden="true" className="size-4 text-primary" />Submission saved</h3><DownloadButton receipt={receipt} /></div>
      <p className="break-words text-sm [overflow-wrap:anywhere]">{receipt.filename}</p>
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <div><dt>Submitted (IST)</dt><dd className="mt-1">{submittedTime(receipt.submitted_at)}</dd></div>
        <div><dt>Receipt ID</dt><dd className="mt-1 break-all font-mono text-xs">{receipt.id}</dd></div>
        <div className="sm:col-span-2"><dt>SHA-256</dt><dd className="mt-1 break-all font-mono text-xs">{receipt.sha256}</dd></div>
      </dl>
    </section>}
    <section aria-labelledby="history-heading" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="history-heading" className="font-semibold">Submission history</h3>
        <Button type="button" variant="ghost" size="icon" title="Refresh submissions" aria-label="Refresh submissions" onClick={() => setRevision(value => value + 1)}><RefreshCw aria-hidden="true" /></Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-48"><Label htmlFor="submission-start">From (IST)</Label><Input id="submission-start" type="date" value={start} onChange={event => { setStart(event.target.value); setPage(1); }} /></div>
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-48"><Label htmlFor="submission-end">To (IST)</Label><Input id="submission-end" type="date" value={end} onChange={event => { setEnd(event.target.value); setPage(1); }} /></div>
      </div>
      {historyError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{historyError}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}><RefreshCw aria-hidden="true" />Retry</Button></div>
        : !history ? <div aria-label="Loading submissions" className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        : history.items.length === 0 ? <p className="border-y border-white/20 py-6 text-sm">{start || end ? "No submissions in this date range." : "No submissions yet."}</p>
        : <>
          <div className="hidden md:block"><Table><TableHeader><TableRow><TableHead>Notebook</TableHead><TableHead>Submitted (IST)</TableHead><TableHead>Size</TableHead><TableHead className="w-16"><span className="sr-only">Download</span></TableHead></TableRow></TableHeader>
            <TableBody>{history.items.map(item => <TableRow key={item.id}><TableCell className="max-w-72 whitespace-normal [overflow-wrap:anywhere]">{item.filename}<p className="mt-1 break-all font-mono text-xs text-white">{item.sha256}</p><ReviewFeedback receipt={item} /></TableCell><TableCell>{submittedTime(item.submitted_at)}</TableCell><TableCell>{(item.size_bytes / 1024).toFixed(1)} KiB</TableCell><TableCell><DownloadButton receipt={item} /></TableCell></TableRow>)}</TableBody>
          </Table></div>
          <div className="space-y-3 md:hidden">{history.items.map(item => <article key={item.id} className="space-y-3 rounded-lg border border-white/20 p-4">
            <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{item.filename}</p><DownloadButton receipt={item} /></div>
            <p className="text-sm">{submittedTime(item.submitted_at)} IST / {(item.size_bytes / 1024).toFixed(1)} KiB</p><p className="break-all font-mono text-xs">{item.sha256}</p>
            <ReviewFeedback receipt={item} />
          </article>)}</div>
        </>}
      {history && history.total > 0 && <div className="flex items-center justify-between gap-3 text-sm"><p>{history.total} submission{history.total === 1 ? "" : "s"} / Page {page} of {Math.max(1, Math.ceil(history.total / 10))}</p>
        <div className="flex gap-2"><Button variant="outline" size="icon" title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft aria-hidden="true" /></Button><Button variant="outline" size="icon" title="Next page" aria-label="Next page" disabled={page * 10 >= history.total} onClick={() => setPage(value => value + 1)}><ChevronRight aria-hidden="true" /></Button></div>
      </div>}
    </section>
  </section>;
}

function ReviewFeedback({ receipt }: { receipt: SubmissionReceipt }) {
  return receipt.review ? <div className="mt-3 space-y-2 border-t border-white/20 pt-3 text-sm">
    <p className="font-semibold text-primary">Graded: {receipt.review.score}/100</p>
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{receipt.review.feedback}</p>
    <p className="text-white">{receipt.review.faculty_name} / {submittedTime(receipt.review.reviewed_at)} IST</p>
  </div> : <p className="mt-3 text-sm text-white">Awaiting review</p>;
}