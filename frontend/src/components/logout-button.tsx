"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton({ audience = "admin" }: { audience?: "admin" | "student" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/${audience}/logout`, { method: "POST", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Sign-out failed");
      window.location.replace(`/${audience}/login`);
    } catch {
      setError("Could not sign out. Please try again.");
      setPending(false);
    }
  }
  return <div className="mt-8"><Button className="h-11 w-full" variant="outline" onClick={signOut} disabled={pending}>
    {pending ? <LoaderCircle className="animate-spin" /> : <LogOut />} {pending ? "Signing out..." : "Sign out"}
  </Button>{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}</div>;
}