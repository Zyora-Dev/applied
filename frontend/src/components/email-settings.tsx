"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle, Mail, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type EmailSettings = { from_name: string; from_email: string; token_configured: boolean };

async function settingsRequest(init: RequestInit = {}): Promise<EmailSettings> {
  const response = await fetch("/api/admin/settings/email", { ...init, cache: "no-store" });
  if (response.status === 401) { window.location.replace("/admin/login"); throw new Error("Please sign in again."); }
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Unable to save email settings.");
  return body;
}

export function EmailSettingsPanel() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    settingsRequest({ signal: controller.signal }).then(setSettings).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load email settings.");
    });
    return () => controller.abort();
  }, [revision]);
  if (error) return <div className="space-y-4"><p role="alert" className="text-sm text-foreground">{error}</p><Button variant="outline" className="h-9" onClick={() => { setError(""); setRevision((value) => value + 1); }}><RefreshCw className="size-4" />Retry</Button></div>;
  if (!settings) return <div role="status" aria-label="Loading email settings" className="space-y-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-56 w-full" /></div>;
  return <EmailSettingsForm initial={settings} />;
}

export function EmailSettingsForm({ initial }: { initial: EmailSettings }) {
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setError(""); setSaved(false);
    try {
      const result = await settingsRequest({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        from_name: String(data.get("from_name") || "").trim(), from_email: String(data.get("from_email") || "").trim(), send_mail_token: String(data.get("send_mail_token") || "").trim(),
      }) });
      const tokenInput = form.elements.namedItem("send_mail_token") as HTMLInputElement;
      tokenInput.value = "";
      setSettings(result); setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save email settings."); }
    finally { setPending(false); }
  }

  return <form onSubmit={submit} onChange={() => setSaved(false)} className="space-y-5">
    <Card className="gap-0 rounded-lg border border-border bg-[#111111] py-0 ring-0">
      <CardHeader className="border-b border-border px-5 py-4"><CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4 text-primary" />ZeptoMail</CardTitle></CardHeader>
      <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="mail-from-name" className="text-sm text-foreground">From name</Label><Input id="mail-from-name" name="from_name" defaultValue={settings.from_name} required maxLength={150} disabled={pending} className="h-9 text-sm" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="mail-from-email" className="text-sm text-foreground">From email</Label><Input id="mail-from-email" name="from_email" type="email" defaultValue={settings.from_email} required maxLength={254} disabled={pending} className="h-9 text-sm" /></div>
        <div className="min-w-0 space-y-2 sm:col-span-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="mail-token" className="text-sm text-foreground">Send-mail token</Label>{settings.token_configured && <span className="flex items-center gap-1.5 text-sm text-foreground"><Check className="size-4 text-primary" />Token saved</span>}</div><Input id="mail-token" name="send_mail_token" type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} required={!settings.token_configured} placeholder={settings.token_configured ? "Leave blank to keep saved token" : "Send-mail token"} disabled={pending} className="h-9 text-sm" /></div>
      </CardContent>
    </Card>
    {error && <p role="alert" className="rounded-md border border-destructive/50 p-4 text-sm text-foreground">{error}</p>}
    <div className="flex flex-wrap items-center justify-end gap-3">{saved && <p role="status" className="text-sm text-foreground">Email settings saved.</p>}<Button type="submit" className="h-9" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Saving..." : "Save settings"}</Button></div>
  </form>;
}