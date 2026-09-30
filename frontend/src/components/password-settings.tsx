"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordSettings({ audience = "admin" }: { audience?: "admin" | "student" }) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = Object.fromEntries(fields);
    if (payload.new_password !== payload.confirm_password) { setError("New passwords do not match."); return; }
    if (payload.new_password === payload.current_password) { setError("Choose a different new password."); return; }
    setPending(true);
    setError("");
    try {
      const response = await fetch(audience === "student" ? "/api/student/password" : "/api/admin/settings/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const result = await response.json();
        setError(result.detail || "Unable to change password.");
        return;
      }
      form.reset();
      setSaved(true);
    } catch { setError("Unable to connect. Please try again."); }
    finally { setPending(false); }
  }

  return <Card className="rounded-lg border border-border bg-[#101010] shadow-none ring-0">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-primary" />Change password</CardTitle></CardHeader>
    <CardContent>
      {saved ? <div className="space-y-4"><p role="status" className="text-sm text-white">Password changed. All {audience} sessions have been signed out.</p><Button onClick={() => window.location.replace(audience === "student" ? "/student/login" : "/admin/login")}>Sign in again</Button></div> :
        <form onSubmit={submit} className="max-w-2xl space-y-5" aria-busy={pending}>
          <div className="grid gap-5 sm:grid-cols-2">
            {[["current_password", "Current password"], ["new_password", "New password"], ["confirm_password", "Confirm new password"]].map(([name, label]) => <div key={name} className={name === "current_password" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
              <Label htmlFor={name}>{label}</Label>
              <Input id={name} name={name} type={visible ? "text" : "password"} autoComplete={name === "current_password" ? "current-password" : "new-password"} minLength={name === "current_password" ? 1 : 8} maxLength={name === "current_password" ? 1024 : 128} required disabled={pending} aria-describedby={error ? "password-error" : undefined} />
            </div>)}
          </div>
          {error && <p id="password-error" role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3"><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}{pending ? "Changing..." : "Change password"}</Button><Button type="button" variant="outline" size="icon" title={visible ? "Hide passwords" : "Show passwords"} aria-label={visible ? "Hide passwords" : "Show passwords"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button></div>
        </form>}
    </CardContent>
  </Card>;
}