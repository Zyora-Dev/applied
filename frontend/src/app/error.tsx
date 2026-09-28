"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { RefreshCw } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const router = useRouter();
  return <AuthShell><section className="login-panel"><p className="eyebrow">CONNECTION INTERRUPTED</p>
    <h1>Temporarily unavailable.</h1><p className="login-subtitle">We couldn&apos;t connect to the admin service.</p>
    <Button className="mt-8 h-11" onClick={() => startTransition(() => { router.refresh(); reset(); })}><RefreshCw /> Try again</Button>
  </section></AuthShell>;
}