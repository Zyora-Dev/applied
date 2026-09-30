"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Mail, X } from "lucide-react";
import { type Student, studentRequest } from "@/lib/students";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Outcome = { id: number; name: string; email: string; accepted: boolean; detail: string };

export function StudentInvitations({ selected, clear, disabled }: { selected: Student[]; clear: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<Student[]>([]);
  const [pending, setPending] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [started, setStarted] = useState(false);
  const stop = useRef(false);
  const busy = useRef(false);

  async function send() {
    if (busy.current) return;
    busy.current = true;
    stop.current = false;
    setPending(true);
    setStarted(true);
    for (const student of recipients) {
      if (stop.current) break;
      let accepted = false;
      let detail = "";
      try {
        const result = await studentRequest<{ email_delivery: string }>(`${student.id}/invitation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        accepted = result.email_delivery === "accepted";
        detail = accepted ? "Accepted by email provider" : "Not accepted by email provider";
      } catch (failure) { detail = failure instanceof Error ? failure.message : "Delivery unknown. Check before resending."; }
      setOutcomes((previous) => [...previous, { id: student.id, name: student.name, email: student.email, accepted, detail }]);
    }
    busy.current = false;
    setPending(false);
  }

  return <>
    <div className="flex flex-wrap items-center gap-3"><span className="text-sm tabular-nums">{selected.length} selected</span><Button className="h-9" disabled={disabled || !selected.length} onClick={() => { setRecipients([...selected]); setOutcomes([]); setStarted(false); setOpen(true); }}><Mail className="size-4" />Send invitations</Button>{selected.length > 0 && <Button variant="outline" size="icon" className="size-9" title="Clear selection" aria-label="Clear selection" disabled={pending} onClick={clear}><X className="size-4" /></Button>}</div>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}><DialogContent showCloseButton={!pending} className="max-h-[90svh] overflow-y-auto rounded-lg border border-border sm:max-w-xl"><DialogHeader><DialogTitle>{started ? "Invitation results" : "Send student invitations?"}</DialogTitle><DialogDescription className="text-foreground">{started ? `${outcomes.filter((item) => item.accepted).length} accepted, ${outcomes.filter((item) => !item.accepted).length} unsuccessful, ${recipients.length - outcomes.length} remaining.` : `${recipients.length} email${recipients.length === 1 ? "" : "s"} will be sent now. Links expire in 24 hours. Resending replaces any previous invitation.`}</DialogDescription></DialogHeader>
      <ul className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-4">{started ? outcomes.map((item) => <li key={item.id} className="space-y-1 text-sm"><p className="font-medium break-words">{item.name}</p><p className="break-all">{item.email}</p><p className={item.accepted ? "text-primary" : "text-foreground"}>{item.detail}</p></li>) : recipients.map((student) => <li key={student.id} className="text-sm"><p className="font-medium break-words">{student.name}</p><p className="break-all">{student.email}</p></li>)}</ul>
      {pending && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />Sending {Math.min(outcomes.length + 1, recipients.length)} of {recipients.length}</p>}
      <DialogFooter>{pending ? <Button variant="outline" className="h-9" onClick={() => { stop.current = true; }}>Stop after current email</Button> : <Button variant="outline" className="h-9" onClick={() => setOpen(false)}>{started ? "Done" : "Cancel"}</Button>}{!started && <Button className="h-9" onClick={send}><Mail className="size-4" />Send {recipients.length} invitation{recipients.length === 1 ? "" : "s"}</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </>;
}