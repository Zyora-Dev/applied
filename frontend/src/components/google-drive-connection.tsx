"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileCode2, FolderOpen, HardDrive, Link2, LoaderCircle, RefreshCw, Unlink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPicker, pickNotebook, type NotebookSelection } from "@/lib/google-picker";

export function GoogleDriveConnection({ outcome, onNotebookChange, selectionDisabled = false, submitted = false }: {
  outcome?: string; onNotebookChange?: (notebook: NotebookSelection | null) => void; selectionDisabled?: boolean; submitted?: boolean;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState(false);
  const [notebook, setNotebook] = useState<NotebookSelection | null>(null);
  const pickerRequest = useRef<AbortController | null>(null);
  const busy = pending || picking || selectionDisabled;
  const feedback = outcome === "cancelled" ? "Google connection cancelled."
    : outcome === "expired" ? "Connection attempt expired. Please try again."
    : outcome === "error" ? "Google connection was not completed. Please try again." : "";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/student/google-drive", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (controller.signal.aborted) return;
        if (response.status === 401) { window.location.replace("/student/login"); return; }
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (typeof result.connected !== "boolean") throw new Error();
        if (!controller.signal.aborted) setConnected(result.connected);
      } catch {
        if (!controller.signal.aborted) setError("Unable to check Google Drive connection.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => { pickerRequest.current?.abort(); }, []);

  function updateNotebook(selected: NotebookSelection | null) {
    setNotebook(selected);
    onNotebookChange?.(selected);
  }

  async function selectNotebook() {
    if (busy || pickerRequest.current) return;
    const controller = new AbortController();
    pickerRequest.current = controller;
    setPicking(true);
    setError("");
    try {
      await loadPicker();
      controller.signal.throwIfAborted();
      const response = await fetch("/api/student/google-drive/picker", { method: "POST", cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (response.status === 401) { window.location.replace("/student/login"); return; }
      if (response.status === 409) { updateNotebook(null); throw new Error("Reconnect Google Drive, then select your notebook again."); }
      if (!response.ok) throw new Error("Unable to open Google Drive. Please try again.");
      const selected = await pickNotebook(await response.json(), controller.signal);
      if (!controller.signal.aborted && selected) updateNotebook(selected);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to open Google Drive. Please try again.");
    } finally {
      pickerRequest.current = null;
      if (!controller.signal.aborted) setPicking(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/student/google-drive", { method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.status === 401) { window.location.replace("/student/login"); return; }
      if (response.status !== 204) throw new Error();
      setConnected(false);
      updateNotebook(null);
    } catch { updateNotebook(null); setConnected(null); setError("Disconnect not confirmed. Check the connection again."); }
    finally { setPending(false); }
  }

  return <Card className="rounded-lg border border-border bg-[#101010] shadow-none ring-0">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><HardDrive aria-hidden="true" className="size-4 text-primary" />Google Drive</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4" aria-busy={busy || (connected === null && !error)}>
        <p role="status" className="flex items-center gap-2 text-sm text-white">{connected ? <Check aria-hidden="true" className="size-4 text-primary" /> : connected === null && !error ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}{connected === null ? error ? "Connection status unavailable" : "Checking connection..." : connected ? "Connected" : "Not connected"}</p>
        {connected !== null && <div className="flex flex-wrap gap-3">
          <form action="/api/student/google-drive/connect" method="post" onSubmit={() => setPending(true)}>
            <Button type="submit" disabled={busy}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Link2 aria-hidden="true" />}{connected ? "Reconnect" : "Connect Google Drive"}</Button>
          </form>
          {connected && <Button type="button" variant="outline" disabled={busy} onClick={disconnect}><Unlink aria-hidden="true" />Disconnect</Button>}
        </div>}
        {connected === null && error && <Button type="button" variant="outline" disabled={pending} onClick={() => { setError(""); setAttempt(attempt + 1); }}><RefreshCw aria-hidden="true" />Retry</Button>}
      </div>
      {connected && <div className="space-y-3 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={busy} onClick={selectNotebook}>
          {picking ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <FolderOpen aria-hidden="true" />}
          {picking ? "Opening Google Drive..." : notebook ? "Change notebook" : "Select notebook"}
        </Button>
        {notebook && <div className="flex min-w-0 items-center gap-3 text-sm text-white" role="status">
          <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1"><p className="[overflow-wrap:anywhere]">{notebook.name}</p><p className="mt-1 text-xs text-white">{submitted ? "Snapshot submitted" : "Selected, not submitted"}</p></div>
          <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Clear notebook selection" title="Clear notebook selection" onClick={() => updateNotebook(null)}><X aria-hidden="true" /></Button>
        </div>}
      </div>}
      {(error || feedback) && <p role="alert" className="text-sm text-white">{error || feedback}</p>}
    </CardContent>
  </Card>;
}