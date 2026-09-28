"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LoginForm({ audience = "admin" }: { audience?: "admin" | "student" }) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [capsLock, setCapsLock] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/${audience}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.get("email"), password: values.get("password") }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to sign in. Please try again.");
        setPending(false);
        return;
      }
      form.reset();
      window.location.replace(`/${audience}`);
    } catch {
      setError("Unable to connect. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-heading">
        <div className="login-emblem"><ShieldCheck size={28} strokeWidth={1.5} aria-hidden="true" /></div>
        <p className="eyebrow">{audience === "student" ? "STUDENT ACCESS" : "ADMINISTRATOR ACCESS"}</p>
        <h1 id="login-title">Welcome back.</h1>
        <p className="login-subtitle">Sign in to your {audience} account.</p>
      </div>
      <form onSubmit={submit} className="login-form" aria-busy={pending}>
        <div className="field-group">
          <Label htmlFor="email" className="field-label">Email address</Label>
          <div className="input-wrapper">
            <Mail className="field-icon" size={18} aria-hidden="true" />
            <Input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com"
              className="auth-input" required maxLength={320} disabled={pending} spellCheck={false}
              autoCapitalize="none" aria-describedby={error ? "login-error" : undefined} />
          </div>
        </div>
        <div className="field-group">
          <Label htmlFor="password" className="field-label">Password</Label>
          <div className="input-wrapper">
            <LockKeyhole className="field-icon" size={18} aria-hidden="true" />
            <Input id="password" name="password" type={visible ? "text" : "password"}
              autoComplete="current-password" placeholder="Enter your password" className="auth-input password-input"
              required maxLength={1024} disabled={pending} aria-describedby={error ? "login-error" : undefined}
              onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
              onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="password-toggle"
                  aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}
                  disabled={pending} onClick={() => setVisible(!visible)}>
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{visible ? "Hide password" : "Show password"}</TooltipContent>
            </Tooltip>
          </div>
          {capsLock && <p className="caps-lock" role="status">Caps Lock is on.</p>}
        </div>
        {error && <div id="login-error" className="form-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></div>}
        <Button type="submit" className="sign-in-button" disabled={pending}>
          {pending ? <><LoaderCircle className="animate-spin" />Signing in...</> : <>Sign in<ArrowRight size={18} /></>}
        </Button>
      </form>
      {audience === "student" ? <div className="mt-7 space-y-4 text-center text-sm text-white">
        <p>New student? <Link href="/student/register" className="underline underline-offset-4">Create an account</Link></p>
      </div> : <>
        <div className="login-bottom"><span className="small-line" /><LockKeyhole size={13} aria-hidden="true" /><span>Authorized administrators only</span><span className="small-line" /></div>
        <p className="mt-6 text-center text-sm text-white"><Link href="/student/login" className="underline underline-offset-4">Student sign in / Register</Link></p>
      </>}
    </section>
  );
}