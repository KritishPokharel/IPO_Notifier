import Link from "next/link";
import { Change } from "@/components/dashboard/badges";
import { PageHeader } from "@/components/dashboard/empty";
import { SetupNotice } from "@/components/dashboard/market-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERIODS, type Period } from "@/lib/analytics/calc";
import type { EtfMetrics } from "@/lib/analytics/metrics";
import { getDashboardData } from "@/lib/data";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

function ReturnsTable({ etfs, pick }: { etfs: EtfMetrics[]; pick: (e: EtfMetrics) => Record<Period, number | null> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ETF</TableHead>
          {PERIODS.map((p) => <TableHead key={p} className="text-right">{p}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {etfs.map((e) => (
          <TableRow key={e.ticker}>
            <TableCell><Link href={`/etf/${e.ticker}`} className="font-medium hover:underline">{e.ticker}</Link></TableCell>
            {PERIODS.map((p) => <TableCell key={p} className="text-right"><Change value={pick(e)[p]} /></TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function HistoryPage() {
  const data = await getDashboardData();
  const etfs = data.snapshot?.etfs ?? [];
  return (
    <>
      <PageHeader
        title="Historical analysis"
        description="Returns are cumulative (not annualized). A dash means the fund lacks enough history for that period or data is unavailable."
      />
      <SetupNotice data={data} />
      {etfs.length ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Price returns</CardTitle>
              <CardDescription>Change in split-adjusted closing price; excludes distributions.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto"><ReturnsTable etfs={etfs} pick={(e) => e.priceReturns} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total returns</CardTitle>
              <CardDescription>Dividend-adjusted closes (distributions reinvested), as of the last stored official close.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto"><ReturnsTable etfs={etfs} pick={(e) => e.totalReturns} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Trend, volatility and drawdown</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ETF</TableHead>
                    <TableHead className="text-right">MA20</TableHead>
                    <TableHead className="text-right">MA50</TableHead>
                    <TableHead className="text-right">MA200</TableHead>
                    <TableHead className="text-right">vs MA200</TableHead>
                    <TableHead className="text-right">Vol 20d</TableHead>
                    <TableHead className="text-right">Vol 1Y</TableHead>
                    <TableHead className="text-right">Max DD 1Y</TableHead>
                    <TableHead className="text-right">Max DD all</TableHead>
                    <TableHead className="text-right">All-time high</TableHead>
                    <TableHead className="text-right">Streak</TableHead>
                    <TableHead className="text-right">History since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {etfs.map((e) => (
                    <TableRow key={e.ticker}>
                      <TableCell><Link href={`/etf/${e.ticker}`} className="font-medium hover:underline">{e.ticker}</Link></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPrice(e.ma20)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPrice(e.ma50)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPrice(e.ma200)}</TableCell>
                      <TableCell className="text-right"><Change value={e.pctFromMa200} /></TableCell>
                      <TableCell className="text-right tabular-nums">{e.vol20d === null ? "—" : `${e.vol20d.toFixed(1)}%`}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.vol1y === null ? "—" : `${e.vol1y.toFixed(1)}%`}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-500">{fmtPct(e.maxDrawdown1y?.pct, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-500">{fmtPct(e.maxDrawdownAll?.pct, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPrice(e.allTimeHigh?.value)}</TableCell>
                      <TableCell className="text-right">{e.streak.count ? `${e.streak.count} ${e.streak.direction}` : "—"}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{fmtDate(e.historyStart)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
