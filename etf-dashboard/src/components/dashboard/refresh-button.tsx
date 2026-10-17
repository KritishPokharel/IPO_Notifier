"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const body = (await res.json()) as { message?: string; error?: string };
      setMsg(body.message ?? body.error ?? (res.ok ? "Updated" : "Refresh failed"));
      start(() => router.refresh());
    } catch {
      setMsg("Refresh failed — network error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      {msg ? <span className="max-w-xs truncate text-xs text-muted-foreground" title={msg}>{msg}</span> : null}
      <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
        <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
        {busy ? "Refreshing…" : "Refresh now"}
      </Button>
    </div>
  );
}
