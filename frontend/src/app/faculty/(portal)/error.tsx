"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function FacultyError({ reset }: { reset: () => void }) {
  return <section className="space-y-4 p-6 text-white"><h1 className="text-xl font-semibold">Faculty portal unavailable</h1>
    <p>Please try again.</p><Button onClick={reset}><RefreshCw />Retry</Button></section>;
}