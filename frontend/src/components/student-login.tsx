"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, GraduationCap, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StudentLogin({ portal = "student" }: { portal?: "student" | "faculty" } = {}) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/${portal}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }) });
      if (!response.ok) {
        const result = await response.json();
        setError(result.detail || "Unable to sign in. Please try again.");
        setPending(false);
        return;
      }
      window.location.replace(portal === "faculty" ? "/faculty" : "/dashboard");
    } catch { setError("Unable to connect. Please try again."); setPending(false); }
  }

  return <main className="student-signin grid min-h-svh bg-[#0b0c0b] lg:grid-cols-[1.08fr_1fr]">
    <section aria-label="Engineering students in Kerala, India" className="relative isolate min-h-48 overflow-hidden border-b border-white/25 lg:min-h-svh lg:border-r lg:border-b-0">
      <Image src="https://images.unsplash.com/photo-1686624386665-4cd01b96d0f6?auto=format&fit=crop&w=1800&q=85" alt="Engineering students taking notes in Chengannur, Kerala, India" fill unoptimized priority sizes="(min-width: 1024px) 52vw, 100vw" className="object-cover object-[55%_center]" />
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-black/35" />
      <div className="relative flex h-full min-h-48 flex-col justify-between gap-12 p-6 sm:p-10 lg:min-h-svh lg:p-12">
        <div className="flex items-center gap-3 text-white"><GraduationCap className="size-7 text-primary" /><span className="text-lg font-semibold">Applied AI</span></div>
        <div className="max-w-md space-y-6">
          <div className="hidden space-y-4 lg:block"><span className="block h-1 w-12 bg-primary" /><h2 className="text-4xl leading-tight font-medium text-white">A new perspective.<br />An open mind.</h2></div>
          <a href="https://unsplash.com/photos/SPO0ST4nVbY" target="_blank" rel="noopener noreferrer" className="text-xs text-white underline decoration-white/50 underline-offset-4 hover:decoration-white">Photo by Aswin Thomas Bony / Unsplash</a>
        </div>
      </div>
    </section>
    <section className="flex min-w-0 flex-col px-6 py-8 sm:px-12 sm:py-10 lg:px-14 lg:py-12">
      <header className="flex items-center justify-between gap-4"><BrandLogo /><span className="text-xs font-medium text-white">{portal === "faculty" ? "Faculty" : "Student"} portal</span></header>
      <div className="flex flex-1 items-center justify-center py-8 sm:py-16">
        <div className="w-full max-w-[380px]">
          <div className="mb-9 space-y-3"><div className="mb-6 flex size-12 items-center justify-center rounded-lg border border-primary/40 bg-primary/10"><GraduationCap className="size-6 text-primary" /></div><p className="text-sm font-medium text-primary">APPLIED AI</p><h1 className="text-3xl font-semibold text-white">Welcome back.</h1><p className="text-sm text-white">Sign in to your {portal} account.</p></div>
          <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
            <div className="space-y-2.5"><Label htmlFor="student-email" className="text-sm text-white">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-white" /><Input id="student-email" name="email" type="email" autoComplete="username" placeholder="you@college.edu" maxLength={254} required disabled={pending} aria-describedby={error ? "student-login-error" : undefined} className="h-12 rounded-lg border-white/30 bg-white/5 pl-11 text-base text-white sm:text-sm" /></div></div>
            <div className="space-y-2.5"><Label htmlFor="student-password" className="text-sm text-white">Password</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-white" /><Input id="student-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" maxLength={1024} required disabled={pending} aria-describedby={error ? "student-login-error" : undefined} className="h-12 rounded-lg border-white/30 bg-white/5 pr-12 pl-11 text-base text-white sm:text-sm" /><Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 size-10" title={visible ? "Hide password" : "Show password"} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} disabled={pending} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button></div></div>
            {error && <p id="student-login-error" role="alert" className="text-sm leading-relaxed text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="h-12 w-full justify-between rounded-lg px-5 text-sm font-semibold">{pending ? "Signing in..." : "Sign in"}{pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}</Button>
          </form>
        </div>
      </div>
      <footer className="border-t border-white/25 pt-5 text-xs text-white">Applied AI <span className="mx-2 text-primary">/</span> Zyora Labs</footer>
    </section>
  </main>;
}