import Link from "next/link";
import { Change, DrawdownBadge, StatusBadge } from "@/components/dashboard/badges";
import { Empty, PageHeader } from "@/components/dashboard/empty";
import { SetupNotice } from "@/components/dashboard/market-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DRAWDOWN_CLASSES } from "@/lib/analytics/calc";
import type { EtfMetrics } from "@/lib/analytics/metrics";
import { getDashboardData } from "@/lib/data";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { getAlertSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function Bar({ pct, max }: { pct: number | null; max: number }) {
  if (pct === null) return null;
  const w = Math.min(100, (Math.abs(pct) / (max || 1)) * 100);
  return (
    <div className="h-2 w-full rounded bg-muted">
      <div className={pct < 0 ? "h-2 rounded bg-red-500" : "h-2 rounded bg-emerald-500"} style={{ width: `${w}%` }} />
    </div>
  );
}

export default async function DropsPage() {
  const data = await getDashboardData();
  const etfs = data.snapshot?.etfs ?? [];
  const settings = await getAlertSettings(await getDb()).catch(() => null);
  const threshold = settings?.thresholdPct ?? 5;
  const byDay = [...etfs].filter((e) => e.dailyChangePct !== null).sort((a, b) => a.dailyChangePct! - b.dailyChangePct!);
  const byDd = [...etfs].filter((e) => e.pctFromHigh52w !== null).sort((a, b) => a.pctFromHigh52w! - b.pctFromHigh52w!);
  const maxDay = Math.max(...byDay.map((e) => Math.abs(e.dailyChangePct!)), 0.01);
  const maxDd = Math.max(...byDd.map((e) => Math.abs(e.pctFromHigh52w!)), 0.01);
  const groups = new Map<string, EtfMetrics[]>();
  for (const e of byDd) groups.set(e.drawdownClass!, [...(groups.get(e.drawdownClass!) ?? []), e]);
  return (
    <>
      <PageHeader
        title="Biggest drops"
        description={data.snapshot ? `Session ${fmtDate(data.snapshot.sessionDate)} · alert threshold: daily decline greater than ${threshold}%` : undefined}
      />
      <SetupNotice data={data} />
      {etfs.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily change</CardTitle>
              <CardDescription>Latest price vs previous trading-day close, worst first</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ETF</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="w-1/3" />
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byDay.map((e) => (
                    <TableRow key={e.ticker} className={e.dailyChangePct! < -threshold ? "bg-red-500/10" : undefined}>
                      <TableCell><Link href={`/etf/${e.ticker}`} className="font-medium hover:underline">{e.ticker}</Link></TableCell>
                      <TableCell className="text-right"><Change value={e.dailyChangePct} /></TableCell>
                      <TableCell><Bar pct={e.dailyChangePct} max={maxDay} /></TableCell>
                      <TableCell><StatusBadge status={e.status} note={e.statusNote} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Decline from 52-week high</CardTitle>
              <CardDescription>((Price − 52W high) / 52W high) × 100, furthest first</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ETF</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">52W high</TableHead>
                    <TableHead className="text-right">From high</TableHead>
                    <TableHead className="w-1/4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byDd.map((e) => (
                    <TableRow key={e.ticker}>
                      <TableCell><Link href={`/etf/${e.ticker}`} className="font-medium hover:underline">{e.ticker}</Link></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPrice(e.price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPrice(e.high52w?.value)}</TableCell>
                      <TableCell className="text-right"><Change value={e.pctFromHigh52w} /></TableCell>
                      <TableCell><Bar pct={e.pctFromHigh52w} max={maxDd} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Drawdown classification</CardTitle>
              <CardDescription>Under 5% near high · 5–10% mild · 10–15% moderate · 15–20% significant · 20–30% bear market · 30%+ severe</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DRAWDOWN_CLASSES.map((c) => (
                <div key={c} className="rounded-lg border p-3">
                  <DrawdownBadge cls={c} />
                  <div className="mt-2 text-sm">
                    {groups.get(c)?.length
                      ? groups.get(c)!.map((e) => (
                          <Link key={e.ticker} href={`/etf/${e.ticker}`} className="mr-3 inline-block hover:underline">
                            {e.ticker} <span className="text-xs text-muted-foreground">{fmtPct(e.pctFromHigh52w, 1)}</span>
                          </Link>
                        ))
                      : <span className="text-muted-foreground">None</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : data.snapshot ? <Empty>No data.</Empty> : null}
    </>
  );
}
