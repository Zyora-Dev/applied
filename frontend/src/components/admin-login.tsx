"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.detail || "Unable to sign in. Please try again.");
        setPending(false);
        return;
      }
      window.location.replace("/admin");
    } catch {
      setError("Unable to connect. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center p-5">
      <Card className="w-full max-w-[360px] gap-6 rounded-lg border border-border bg-[#101010] py-6 shadow-none ring-0">
        <CardHeader className="gap-6 px-6">
          <BrandLogo />
          <CardTitle><h1 className="text-xl font-semibold">Admin sign in</h1></CardTitle>
        </CardHeader>
        <CardContent className="px-6">
          <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="you@company.com" className="h-10" disabled={pending} aria-describedby={error ? "login-error" : undefined} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={1024} className="h-10 pr-11" disabled={pending} aria-describedby={error ? "login-error" : undefined} />
                <Button type="button" variant="ghost" size="icon" className="absolute top-0.5 right-0.5 size-9" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} disabled={pending}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            {error && <p id="login-error" role="alert" className="text-sm leading-relaxed text-destructive">{error}</p>}
            <Button type="submit" className="h-10 w-full gap-2" disabled={pending}>
              {pending ? <><LoaderCircle className="animate-spin" />Signing in...</> : <>Sign in<ArrowRight /></>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}