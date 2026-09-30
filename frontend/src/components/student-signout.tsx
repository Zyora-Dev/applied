"use client";

import { useState } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StudentSignout() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/student/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.replace("/student/login");
    } catch { setError("Unable to sign out. Please try again."); setPending(false); }
  }
  return <div className="min-w-0 flex-1 space-y-2 group-data-[collapsible=icon]:flex-none"><Button variant="outline" title="Sign out" aria-label="Sign out" className="h-8 w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0" disabled={pending} onClick={signout}>{pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}<span className="group-data-[collapsible=icon]:hidden">Sign out</span></Button>{error && <p role="alert" className="text-sm text-destructive group-data-[collapsible=icon]:fixed group-data-[collapsible=icon]:bottom-4 group-data-[collapsible=icon]:left-16 group-data-[collapsible=icon]:z-50 group-data-[collapsible=icon]:w-56 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:border group-data-[collapsible=icon]:bg-background group-data-[collapsible=icon]:p-3">{error}</p>}</div>;
}