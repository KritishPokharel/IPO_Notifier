"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EtfMetrics } from "@/lib/analytics/metrics";
import { COMPARISON_PRESETS, TICKERS } from "@/lib/etfs";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { addDays } from "@/lib/market/time";
import type { HistoryPayload } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Change } from "./badges";

const COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#10b981", "#f43f5e", "#eab308"];
const RANGES = { "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827 } as const;
type Range = keyof typeof RANGES | "YTD";

export function CompareView({ etfs }: { etfs: EtfMetrics[] }) {
  const [selected, setSelected] = useState<string[]>(COMPARISON_PRESETS[0].tickers);
  const [range, setRange] = useState<Range>("1Y");
  const [total, setTotal] = useState(true);
  const [hist, setHist] = useState<Record<string, HistoryPayload>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const missing = selected.filter((t) => !hist[t]);
    if (!missing.length) return;
    Promise.all(missing.map((t) => fetch(`/api/history/${t}`).then((r) => (r.ok ? (r.json() as Promise<HistoryPayload>) : Promise.reject(new Error(`${t}: HTTP ${r.status}`))))))
      .then((rows) => setHist((h) => ({ ...h, ...Object.fromEntries(rows.map((r) => [r.ticker, r])) })))
      .catch((e: Error) => setError(e.message));
  }, [selected, hist]);

  const chart = useMemo(() => {
    const loaded = selected.map((t) => hist[t]).filter(Boolean);
    if (loaded.length !== selected.length || !loaded.length) return null;
    // Common start: the later of the range start and the youngest fund's first date, so lines are comparable.
    const lastDate = loaded.map((h) => h.dates[h.dates.length - 1]).sort()[0];
    if (!lastDate) return { rows: [], start: null };
    const rangeStart = range === "YTD" ? `${lastDate.slice(0, 4)}-01-01` : addDays(lastDate, -RANGES[range]);
    const start = [rangeStart, ...loaded.map((h) => h.dates[0])].sort().pop()!;
    const maps = loaded.map((h) => {
      const vals = total ? h.totalClose : h.close;
      return new Map(h.dates.map((d, i) => [d, vals[i]]));
    });
    const dates = loaded[0].dates.filter((d) => d >= start && d <= lastDate && maps.every((m) => m.has(d)));
    const base = maps.map((m) => m.get(dates[0])!);
    const rows = dates.map((d) => {
      const row: Record<string, number | string> = { date: d };
      selected.forEach((t, i) => {
        row[t] = Math.round(((maps[i].get(d)! / base[i]) - 1) * 10_000) / 100;
      });
      return row;
    });
    return { rows, start: dates[0] ?? null };
  }, [selected, hist, range, total]);

  const toggle = (t: string) =>
    setSelected((s) => (s.includes(t) ? (s.length > 1 ? s.filter((x) => x !== t) : s) : s.length < 6 ? [...s, t] : s));
  const rows = etfs.filter((e) => selected.includes(e.ticker));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {COMPARISON_PRESETS.map((p) => (
          <Button key={p.label} size="sm" variant={p.tickers.join() === selected.join() ? "secondary" : "outline"} onClick={() => setSelected(p.tickers)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {TICKERS.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={cn("rounded-md border px-2 py-1 text-xs", selected.includes(t) ? "border-foreground/40 bg-accent" : "text-muted-foreground hover:bg-accent")}
          >
            {t}
          </button>
        ))}
        <span className="ml-2 self-center text-xs text-muted-foreground">Select up to 6</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {(["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as Range[]).map((r) => (
          <Button key={r} size="sm" className="h-7 px-2 text-xs" variant={range === r ? "secondary" : "ghost"} onClick={() => setRange(r)}>
            {r}
          </Button>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        <Button size="sm" className="h-7 px-2 text-xs" variant={total ? "secondary" : "ghost"} onClick={() => setTotal(true)}>Total return</Button>
        <Button size="sm" className="h-7 px-2 text-xs" variant={!total ? "secondary" : "ghost"} onClick={() => setTotal(false)}>Price return</Button>
      </div>
      {error ? <p className="text-sm text-red-400">Could not load history: {error}</p> : null}
      {!chart ? (
        <Skeleton className="h-80 w-full" />
      ) : chart.rows.length < 2 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Not enough overlapping history to compare.</p>
      ) : (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Cumulative {total ? "total" : "price"} return since {fmtDate(chart.start)} (common start date for all selected funds).
          </p>
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <LineChart data={chart.rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} tickFormatter={(d: string) => fmtDate(d)} stroke="currentColor" strokeOpacity={0.4} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} stroke="currentColor" strokeOpacity={0.4} width={48} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(d) => fmtDate(String(d))}
                  formatter={(v) => fmtPct(Number(v))}
                />
                <Legend />
                {selected.map((t, i) => (
                  <Line key={t} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.75} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              {rows.map((e) => <TableHead key={e.ticker} className="text-right">{e.ticker}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              [
                ["Price", (e) => fmtPrice(e.price)],
                ["Today", (e) => <Change value={e.dailyChangePct} />],
                ["From 52W high", (e) => <Change value={e.pctFromHigh52w} />],
                ["1Y price return", (e) => <Change value={e.priceReturns["1Y"]} />],
                ["1Y total return", (e) => <Change value={e.totalReturns["1Y"]} />],
                ["3Y total return", (e) => <Change value={e.totalReturns["3Y"]} />],
                ["5Y total return", (e) => <Change value={e.totalReturns["5Y"]} />],
                ["Volatility (1Y)", (e) => (e.vol1y === null ? "—" : `${e.vol1y.toFixed(1)}%`)],
                ["Max drawdown (1Y)", (e) => fmtPct(e.maxDrawdown1y?.pct)],
                ["Expense ratio", (e) => `${e.expense.ratio.toFixed(2)}%${e.expense.status === "verified" ? "" : "*"}`],
                ["Annual cost / $10k", (e) => `$${e.annualFeePer10k.toFixed(2)}`],
                ["Category", (e) => <span className="text-xs">{e.category}</span>],
                ["Concentration", (e) => <span className="text-xs text-muted-foreground">{e.concentrationRisk}</span>],
              ] as [string, (e: EtfMetrics) => React.ReactNode][]
            ).map(([label, f]) => (
              <TableRow key={label}>
                <TableCell className="text-muted-foreground">{label}</TableCell>
                {rows.map((e) => <TableCell key={e.ticker} className="text-right tabular-nums">{f(e)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">* Reference expense ratio, not yet verified against the provider&apos;s website.</p>
    </div>
  );
}
