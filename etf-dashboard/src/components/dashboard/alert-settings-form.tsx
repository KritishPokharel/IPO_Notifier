"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TICKERS } from "@/lib/etfs";
import { fmtPrice } from "@/lib/format";
import type { AlertSettings, WatchlistSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface Target {
  id: number;
  ticker: string;
  direction: "below" | "above";
  target_price: number;
}

async function post(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <span className={cn("text-sm", m.ok ? "text-emerald-500" : "text-red-400")}>{m.text}</span> : null;
}

export function AlertSettingsForm({
  initial,
  watchlist: initialWl,
  targets,
  emailConfigured,
}: {
  initial: AlertSettings;
  watchlist: WatchlistSettings;
  targets: Target[];
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [threshold, setThreshold] = useState(String(initial.thresholdPct));
  const [wl, setWl] = useState({
    drawdownLevels: initialWl.drawdownLevels.join(", "),
    near90dLowPct: String(initialWl.near90dLowPct),
    near52wLowPct: String(initialWl.near52wLowPct),
    unusualSigma: String(initialWl.unusualSigma),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState({ ticker: "VOO", direction: "below" as "below" | "above", price: "" });
  const [targetMsg, setTargetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/settings", {
        alerts: { ...s, thresholdPct: Number(threshold), recipient: s.recipient?.trim() || null },
        watchlist: {
          drawdownLevels: wl.drawdownLevels.split(",").map((x) => Number(x.trim())).filter((x) => x > 0),
          near90dLowPct: Number(wl.near90dLowPct),
          near52wLowPct: Number(wl.near52wLowPct),
          unusualSigma: Number(wl.unusualSigma),
        },
      });
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function testEmail() {
    setTestMsg(null);
    try {
      await post("/api/test-email");
      setTestMsg({ ok: true, text: `Test email sent to ${initial.recipient}` });
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message });
    }
    router.refresh();
  }

  async function addTarget() {
    setTargetMsg(null);
    try {
      await post("/api/targets", { ticker: target.ticker, direction: target.direction, targetPrice: Number(target.price) });
      setTarget((t) => ({ ...t, price: "" }));
      router.refresh();
    } catch (e) {
      setTargetMsg({ ok: false, text: (e as Error).message });
    }
  }

  const toggleTicker = (t: string) =>
    setS((x) => ({ ...x, tickers: x.tickers.includes(t) ? x.tickers.filter((y) => y !== t) : [...x.tickers, t] }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Daily drop alerts</CardTitle>
          <CardDescription>
            Checked only at the three scheduled updates. An email is sent when a validated ETF is down by more than the threshold vs its previous
            trading-day close (exactly −{threshold || "5"}.00% does not trigger). One alert per ETF per session; multiple ETFs are combined.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Email alerts enabled</Label>
            <Switch id="enabled" checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recipient">Recipient email</Label>
            <Input id="recipient" type="email" placeholder="you@example.com" value={s.recipient ?? ""} onChange={(e) => setS({ ...s, recipient: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="threshold">Alert when daily decline is greater than (%)</Label>
            <Input id="threshold" type="number" step="0.1" min="0.1" max="50" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="single">Allow single-source validated prices</Label>
              <p className="text-xs text-muted-foreground">When off, only prices confirmed by an independent second source can trigger alerts.</p>
            </div>
            <Switch id="single" checked={s.allowSingleSource} onCheckedChange={(v) => setS({ ...s, allowSingleSource: v })} />
          </div>
          <div className="grid gap-2">
            <Label>ETFs included</Label>
            <div className="flex flex-wrap gap-1">
              {TICKERS.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTicker(t)}
                  className={cn("rounded-md border px-2 py-1 text-xs", s.tickers.includes(t) ? "border-foreground/40 bg-accent" : "text-muted-foreground")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
            <Button variant="outline" onClick={testEmail} disabled={!initial.recipient}>Send test email</Button>
            <Msg m={msg} />
            <Msg m={testMsg} />
          </div>
          {!emailConfigured ? (
            <p className="text-xs text-amber-500">No email provider configured on the server (RESEND_API_KEY or SMTP_URL). Alerts will be recorded but not delivered.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Target-price alerts</CardTitle>
            <CardDescription>Optional. Evaluated at scheduled updates on validated prices; each fires at most once per session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Select value={target.ticker} onValueChange={(v) => setTarget({ ...target, ticker: v })}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{TICKERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={target.direction} onValueChange={(v) => setTarget({ ...target, direction: v as "below" | "above" })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="below">at or below</SelectItem>
                  <SelectItem value="above">at or above</SelectItem>
                </SelectContent>
              </Select>
              <Input className="w-28" type="number" step="0.01" placeholder="Price" value={target.price} onChange={(e) => setTarget({ ...target, price: e.target.value })} />
              <Button variant="outline" onClick={addTarget} disabled={!(Number(target.price) > 0)}>Add</Button>
            </div>
            <Msg m={targetMsg} />
            {targets.length ? (
              <ul className="divide-y text-sm">
                {targets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5">
                    <span>{t.ticker} {t.direction === "below" ? "≤" : "≥"} {fmtPrice(Number(t.target_price))}</span>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={async () => { await post(`/api/targets?id=${t.id}`, undefined, "DELETE"); router.refresh(); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No target alerts.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Watchlist flag thresholds</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid gap-1">
              <Label htmlFor="dd">Drawdown levels (%, comma-separated)</Label>
              <Input id="dd" value={wl.drawdownLevels} onChange={(e) => setWl({ ...wl, drawdownLevels: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="n90">Near 90-day low within (%)</Label>
              <Input id="n90" type="number" step="0.5" value={wl.near90dLowPct} onChange={(e) => setWl({ ...wl, near90dLowPct: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="n52">Near 52-week low within (%)</Label>
              <Input id="n52" type="number" step="0.5" value={wl.near52wLowPct} onChange={(e) => setWl({ ...wl, near52wLowPct: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sig">Unusual move (σ)</Label>
              <Input id="sig" type="number" step="0.1" value={wl.unusualSigma} onChange={(e) => setWl({ ...wl, unusualSigma: e.target.value })} />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">Saved together with the alert settings.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
