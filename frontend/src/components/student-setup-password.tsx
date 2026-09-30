"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, GraduationCap, LoaderCircle, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordFields } from "@/components/student-actions";
import { Button } from "@/components/ui/button";

export function StudentSetupPassword() {
  const token = useRef("");
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fragment) {
      token.current = fragment;
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token.current)) {
      setError("This invitation link is missing or invalid. Ask your administrator for a new invitation.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/student/invitation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current }), signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Unable to check invitation.");
        if (!controller.signal.aborted) setAccount(result);
      }).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to connect."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password") !== data.get("confirm_password")) { setError("Passwords do not match."); return; }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/student/setup-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current, password: data.get("password"), confirm_password: data.get("confirm_password") }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.detail || "Unable to set password."); }
      form.reset();
      token.current = "";
      setDone(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to connect. Please try again."); }
    finally { setPending(false); }
  }

  return <main className="student-signin grid min-h-svh bg-[#0b0c0b] text-white lg:grid-cols-[1.08fr_1fr]">
    <section aria-label="Engineering students" className="relative isolate min-h-48 overflow-hidden border-b border-white/25 lg:min-h-svh lg:border-r lg:border-b-0">
      <Image src="https://images.unsplash.com/photo-1686624386665-4cd01b96d0f6?auto=format&fit=crop&w=1800&q=85" alt="Engineering students taking notes in Kerala, India" fill unoptimized priority sizes="(min-width: 1024px) 52vw, 100vw" className="object-cover object-[55%_center]" />
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-black/35" />
      <div className="relative flex h-full min-h-48 flex-col justify-between gap-12 p-6 sm:p-10 lg:min-h-svh lg:p-12"><div className="flex items-center gap-3"><GraduationCap className="size-7 text-primary" /><span className="text-lg font-semibold">Applied AI</span></div><div className="space-y-6"><h2 className="hidden text-4xl leading-tight font-medium lg:block">A new perspective.<br />An open mind.</h2><a href="https://unsplash.com/photos/SPO0ST4nVbY" target="_blank" rel="noopener noreferrer" className="text-xs text-white underline underline-offset-4">Photo by Aswin Thomas Bony / Unsplash</a></div></div>
    </section>
    <section className="flex min-w-0 flex-col px-6 py-8 sm:px-12 sm:py-10 lg:px-14 lg:py-12">
      <header className="flex items-center justify-between gap-4"><BrandLogo /><span className="text-xs font-medium">Student portal</span></header>
      <div className="flex flex-1 items-center justify-center py-10 sm:py-16"><div className="w-full max-w-[420px] space-y-7">
        <div className="space-y-3"><div className="mb-6 flex size-12 items-center justify-center rounded-lg border border-primary/40 bg-primary/10">{done ? <CheckCircle2 className="size-6 text-primary" /> : <LockKeyhole className="size-6 text-primary" />}</div><p className="text-sm font-medium text-primary">APPLIED AI</p><h1 className="text-3xl font-semibold">{done ? "You're ready." : "Set up your password"}</h1></div>
        {loading ? <p role="status" className="flex items-center gap-3 text-sm"><LoaderCircle className="size-4 animate-spin" />Checking invitation...</p> : done ? <div className="space-y-6"><p role="status" className="text-sm">Your password is saved and your student account is active.</p><Button nativeButton={false} render={<Link href="/student/login" />} className="h-12 w-full justify-between">Continue to sign in<ArrowRight /></Button></div> : <>
          {account && <><div className="space-y-2"><p className="font-medium break-words">{account.name}</p><p className="text-sm break-all">{account.email}</p></div><form onSubmit={submit} className="space-y-6 [&_input]:h-12 [&_input]:border-white/30 [&_input]:bg-white/5 [&_button[aria-pressed]]:top-1.5 [&_.grid]:grid-cols-1" aria-busy={pending}><PasswordFields disabled={pending} /><p className="text-sm">8-128 characters</p>{error && <p role="alert" className="text-sm text-white">{error}</p>}<Button type="submit" disabled={pending} className="h-12 w-full justify-between">{pending ? "Saving password..." : "Set password & activate account"}{pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}</Button></form></>}
          {!account && <div className="space-y-5"><p role="alert" className="text-sm leading-relaxed">{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Check again</Button><Link href="/student/login" className="block text-sm text-primary underline underline-offset-4">Back to sign in</Link></div>}
        </>}
      </div></div>
      <footer className="border-t border-white/25 pt-5 text-xs">Applied AI <span className="mx-2 text-primary">/</span> Zyora Labs</footer>
    </section>
  </main>;
}