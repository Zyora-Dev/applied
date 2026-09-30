"use client";

import { useState } from "react";
import { LoaderCircle, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import type { WeekAccess } from "@/lib/programme";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function WeekControl({ initial }: { initial: WeekAccess }) {
  const [access, setAccess] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function update(is_open: boolean) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/admin/programme/${access.week}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_open }),
        cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 401) { window.location.replace("/admin/login"); return; }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result?.week !== access.week || typeof result.is_open !== "boolean") throw new Error();
      setAccess(result);
    } catch { setError("Save not confirmed. Refresh to check, or try again."); }
    finally { setPending(false); }
  }

  const Icon = access.is_open ? LockKeyholeOpen : LockKeyhole;
  return <Card className="min-w-0 gap-0 rounded-lg border border-border bg-[#111111] py-0 ring-0">
    <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-5">
      <CardTitle><h2 className="text-base font-semibold">Week {access.week}</h2></CardTitle>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
    </CardHeader>
    <CardContent className="px-4 pb-5">
      <Label htmlFor={`week-${access.week}-open`} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-white">
        <Checkbox id={`week-${access.week}-open`} aria-label={`Unlock Week ${access.week}`} checked={access.is_open} disabled={pending} onCheckedChange={(checked) => void update(checked === true)} />Unlocked
      </Label>
    </CardContent>
    <CardFooter className="min-h-12 gap-2 rounded-b-lg border-white/20 bg-white/5 px-4 py-3">
      {pending && <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />}
      <p role="status" className="text-sm text-white">{pending ? "Saving..." : access.is_open ? "Open to students" : "Locked"}</p>
    </CardFooter>
    {error && <p role="alert" className="px-4 py-3 text-sm text-white">{error}</p>}
  </Card>;
}

export function ProgrammeControls({ initial }: { initial: WeekAccess[] }) {
  return <section aria-label="Week access controls" className="grid grid-cols-2 items-start gap-3 lg:grid-cols-4 lg:gap-4">
    {initial.map((access) => <WeekControl key={`${access.week}-${access.is_open}`} initial={access} />)}
  </section>;
}