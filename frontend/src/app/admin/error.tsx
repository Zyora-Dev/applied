"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
        <p className="text-sm text-foreground">We couldn&apos;t load your account. Please try again.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={reset}><RotateCw />Try again</Button>
          <a href="/admin/login" className="text-sm text-primary underline underline-offset-4">Back to sign in</a>
        </div>
      </div>
    </main>
  );
}