"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Eye, EyeOff, KeyRound, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { type Student, studentRequest } from "@/lib/students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PasswordFields({ disabled = false }: { disabled?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="grid gap-5 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${id}-password`} className="text-sm text-foreground">New password</Label>
      <div className="relative">
        <Input id={`${id}-password`} name="password" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} required disabled={disabled} className="h-9 pr-10 text-sm" />
        <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 size-9" title={visible ? "Hide password" : "Show password"} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} disabled={disabled} onClick={() => setVisible(!visible)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
      </div>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-confirm`} className="text-sm text-foreground">Confirm password</Label>
      <Input id={`${id}-confirm`} name="confirm_password" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} required disabled={disabled} className="h-9 text-sm" />
    </div>
  </div>;
}

export function StudentActions({ student, onChanged, onDeleted }: { student: Student; onChanged: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const [action, setAction] = useState<"delete" | "password" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function open(next: "delete" | "password") {
    setError("");
    setNotice("");
    setAction(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (action === "password" && data.get("password") !== data.get("confirm_password")) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setPending(true);
    try {
      if (action === "delete") {
        await studentRequest(`${student.id}`, { method: "DELETE" });
        setAction(null);
        onDeleted();
      } else {
        await studentRequest(`${student.id}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: data.get("password") }) });
        form.reset();
        setNotice("Password reset successfully.");
        onChanged();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to complete the request.");
    } finally { setPending(false); }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="size-9 shrink-0" title={`Actions for ${student.name}`} aria-label={`Actions for ${student.name}`} />}><Ellipsis className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 border border-border">
        <DropdownMenuItem className="min-h-9" onClick={() => router.push(`/admin/students/${student.id}`)}><Eye />View student</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9" onClick={() => router.push(`/admin/students/${student.id}/edit`)}><Pencil />Edit student</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9" onClick={() => open("password")}><KeyRound />Reset password</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-9" variant="destructive" onClick={() => open("delete")}><Trash2 />Delete student</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={action !== null} onOpenChange={(isOpen) => { if (!isOpen && !pending) setAction(null); }}>
      <DialogContent showCloseButton={!pending} className="max-h-[90svh] overflow-y-auto rounded-lg border border-border sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{action === "delete" ? "Delete student" : "Reset password"}</DialogTitle>
            <DialogDescription className="break-words text-foreground">{action === "delete" ? `${student.name} will be deactivated and removed from the student list. Their record will be retained.` : `${student.name} (${student.student_id})`}</DialogDescription>
          </DialogHeader>
          {action === "password" && !notice && <PasswordFields disabled={pending} />}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-9" disabled={pending} onClick={() => setAction(null)}>{notice ? "Done" : "Cancel"}</Button>
            {!notice && <Button type="submit" variant={action === "delete" ? "destructive" : "default"} className="h-9" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : action === "delete" ? <Trash2 className="size-4" /> : <KeyRound className="size-4" />}{action === "delete" ? "Delete student" : "Reset password"}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}