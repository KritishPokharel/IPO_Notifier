import Link from "next/link";
import { AnalysisCard } from "@/components/dashboard/analysis-card";
import { Change } from "@/components/dashboard/badges";
import { EtfTable } from "@/components/dashboard/etf-table";
import { MarketBanner, SetupNotice } from "@/components/dashboard/market-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtfMetrics } from "@/lib/analytics/metrics";
import { summarize } from "@/lib/analytics/summary";
import { getDashboardData } from "@/lib/data";
import { fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ title, value, sub }: { title: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {sub ? <CardContent className="text-xs text-muted-foreground">{sub}</CardContent> : null}
    </Card>
  );
}

function EtfLink({ e }: { e: EtfMetrics | null }) {
  return e ? <Link href={`/etf/${e.ticker}`} className="hover:underline">{e.ticker}</Link> : <>—</>;
}

function categoryRows(etfs: EtfMetrics[]) {
  const groups = new Map<string, EtfMetrics[]>();
  for (const e of etfs) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
  return [...groups.entries()].map(([group, members]) => {
    const avg = (f: (e: EtfMetrics) => number | null) => {
      const xs = members.map(f).filter((v): v is number => v !== null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    return { group, members, day: avg((e) => e.dailyChangePct), dd: avg((e) => e.pctFromHigh52w), y1: avg((e) => e.priceReturns["1Y"]) };
  });
}

export default async function OverviewPage() {
  const data = await getDashboardData();
  const snap = data.snapshot;
  const s = snap ? summarize(snap.etfs) : null;
  return (
    <>
      <MarketBanner data={data} />
      <SetupNotice data={data} />
      {snap && s ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="ETFs up / down" value={<><span className="text-emerald-500">{s.up}</span> / <span className="text-red-500">{s.down}</span></>} sub={`${s.unchanged} unchanged · ${s.total} tracked`} />
            <Stat title="Biggest gainer" value={<EtfLink e={s.biggestGainer} />} sub={<Change value={s.biggestGainer?.dailyChangePct} />} />
            <Stat title="Biggest loser" value={<EtfLink e={s.biggestLoser} />} sub={<Change value={s.biggestLoser?.dailyChangePct} />} />
            <Stat
              title="Furthest below 52W high"
              value={<EtfLink e={s.furthestBelowHigh} />}
              sub={<>{fmtPct(s.furthestBelowHigh?.pctFromHigh52w)} · {s.downMoreThan10} ETF(s) down &gt;10%, {s.downMoreThan20} down &gt;20%</>}
            />
          </div>
          <EtfTable etfs={snap.etfs} />
          <Card>
            <CardHeader>
              <CardTitle>By category</CardTitle>
              <CardDescription>Simple averages across ETFs in each group.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {categoryRows(snap.etfs).map((c) => (
                <div key={c.group} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">{c.group}</div>
                  <div className="text-xs text-muted-foreground">{c.members.map((m) => m.ticker).join(", ")}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Today</dt>
                    <dd className="text-right"><Change value={c.day} /></dd>
                    <dt className="text-muted-foreground">From high</dt>
                    <dd className="text-right"><Change value={c.dd} /></dd>
                    <dt className="text-muted-foreground">1Y</dt>
                    <dd className="text-right"><Change value={c.y1} /></dd>
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>
          <AnalysisCard analysis={snap.analysis} />
        </>
      ) : null}
    </>
  );
}
