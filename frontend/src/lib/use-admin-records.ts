"use client";

import { useEffect, useState } from "react";

export function useAdminRecords<Data>(path: string, revision: number) {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{ key: string; data?: Data; error?: string }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/admin/${path}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (response.status === 401) { window.location.replace("/admin/login"); return; }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load records.");
        if (!controller.signal.aborted) setResult({ key, data: body });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Unable to load records." });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, path]);
  return result.key === key ? { ...result, loading: false } : { loading: true, data: undefined, error: undefined };
}