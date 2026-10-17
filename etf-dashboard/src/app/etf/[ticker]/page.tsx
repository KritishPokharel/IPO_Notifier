import Link from "next/link";
import { notFound } from "next/navigation";
import { Change, DrawdownBadge, StatusBadge } from "@/components/dashboard/badges";
import { PriceChart } from "@/components/dashboard/price-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERIODS } from "@/lib/analytics/calc";
import { getDashboardData } from "@/lib/data";
import { ETF_BY_TICKER, isTrackedTicker } from "@/lib/etfs";
import { changeColor, fmtDate, fmtMoneyChange, fmtPct, fmtPrice } from "@/lib/format";
import { formatEt } from "@/lib/market/time";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

const ext = (e: { value: number; date: string } | null) => (e ? <>{fmtPrice(e.value)} <span className="text-xs text-muted-foreground">({fmtDate(e.date)})</span></> : "—");

export default async function EtfPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase();
  if (!isTrackedTicker(ticker)) notFound();
  const def = ETF_BY_TICKER[ticker];
  const data = await getDashboardData();
  const e = data.snapshot?.etfs.find((x) => x.ticker === ticker) ?? null;
  const l = e?.latest ?? null;
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:underline">← Overview</Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {ticker} <span className="text-base font-normal text-muted-foreground">{def.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{def.category} · {def.focus}</p>
        </div>
        {e ? (
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{fmtPrice(e.price)}</div>
            <div className="text-sm">
              <span className={changeColor(e.dailyChange)}>{fmtMoneyChange(e.dailyChange)}</span> <Change value={e.dailyChangePct} /> vs{" "}
              {fmtDate(e.prevCloseDate)} close
            </div>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-0">
          <PriceChart ticker={ticker} high52w={e?.high52w?.value ?? null} low52w={e?.low52w?.value ?? null} />
        </CardContent>
      </Card>

      {e ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">Latest price <StatusBadge status={e.status} note={e.statusNote} /></CardTitle>
              <CardDescription>Where this number came from</CardDescription>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label="Price">{fmtPrice(e.price)}</Row>
                <Row label="Type">{l?.kind === "close" ? "Official close" : `Intraday (${l?.priceField ?? "quote"})`}</Row>
                <Row label="Session">{fmtDate(l?.sessionDate)}</Row>
                <Row label="Source">{l?.source ?? "—"}{l?.isDelayed ? " (delayed)" : ""}</Row>
                <Row label="Quote time">{l?.quoteTimestamp ? `${formatEt(l.quoteTimestamp)} ET` : "—"}</Row>
                <Row label="Retrieved">{l?.retrievedAt ? `${formatEt(l.retrievedAt)} ET` : "—"}</Row>
                <Row label="Cross-check">
                  {l?.secondarySource ? `${l.secondarySource}: ${fmtPrice(l.secondaryPrice)} (${fmtPct(l.discrepancyPct, 3)})` : "None"}
                </Row>
                <Row label="Previous close">{fmtPrice(e.prevClose)} <span className="text-xs text-muted-foreground">({fmtDate(e.prevCloseDate)})</span></Row>
              </dl>
              {l?.issues.length ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {l.issues.map((i) => (
                    <li key={i.code + i.message} className={i.severity === "error" ? "text-red-400" : i.severity === "warning" ? "text-amber-500" : "text-muted-foreground"}>
                      {i.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Range &amp; drawdown</CardTitle>
              <CardDescription>Highs/lows use split-adjusted daily highs and lows</CardDescription>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label="52-week high">{ext(e.high52w)}</Row>
                <Row label="52-week low">{ext(e.low52w)}</Row>
                <Row label="Below 52W high"><span className={changeColor(e.pctFromHigh52w)}>{fmtPct(e.pctFromHigh52w)}</span></Row>
                <Row label="Above 52W low">{fmtPct(e.pctAboveLow52w)}</Row>
                <Row label="Classification"><DrawdownBadge cls={e.drawdownClass} /></Row>
                <Row label="30-day high / low">{fmtPrice(e.high30d?.value)} / {fmtPrice(e.low30d?.value)}</Row>
                <Row label="90-day high / low">{fmtPrice(e.high90d?.value)} / {fmtPrice(e.low90d?.value)}</Row>
                <Row label="All-time high">{ext(e.allTimeHigh)}</Row>
                <Row label="Max drawdown (1Y)">{fmtPct(e.maxDrawdown1y?.pct)}</Row>
                <Row label="Max drawdown (all)">
                  {fmtPct(e.maxDrawdownAll?.pct)}{" "}
                  {e.maxDrawdownAll?.troughDate ? <span className="text-xs text-muted-foreground">(trough {fmtDate(e.maxDrawdownAll.troughDate)})</span> : null}
                </Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trend &amp; risk</CardTitle>
              <CardDescription>History since {fmtDate(e.historyStart)} ({e.historySessions.toLocaleString()} sessions)</CardDescription>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label="20-day average">{fmtPrice(e.ma20)}</Row>
                <Row label="50-day average">{fmtPrice(e.ma50)}</Row>
                <Row label="200-day average">{fmtPrice(e.ma200)}</Row>
                <Row label="vs 200-day average"><Change value={e.pctFromMa200} /></Row>
                <Row label="Volatility (20d, annualized)">{fmtPct(e.vol20d).replace("+", "")}</Row>
                <Row label="Volatility (1Y, annualized)">{fmtPct(e.vol1y).replace("+", "")}</Row>
                <Row label="Today in std devs">{e.dailyZ === null ? "—" : `${e.dailyZ.toFixed(2)}σ`}</Row>
                <Row label="Streak">{e.streak.count ? `${e.streak.count} ${e.streak.direction} day(s)` : "—"}</Row>
                <Row label="Expense ratio">
                  {e.expense.ratio.toFixed(2)}%{" "}
                  <span className="text-xs text-muted-foreground">({e.expense.status === "verified" ? `verified ${fmtDate(e.expense.verifiedAt)}` : "reference — verify on provider site"})</span>
                </Row>
                <Row label="Annual cost per $10,000">${e.annualFeePer10k.toFixed(2)}</Row>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Concentration: {e.concentrationRisk}</p>
              <a href={def.providerUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sky-500 hover:underline">
                Official fund page →
              </a>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Returns</CardTitle>
              <CardDescription>
                Price return excludes distributions; total return assumes distributions are reinvested. Periods longer than the fund&apos;s history are not shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    {PERIODS.map((p) => <TableHead key={p} className="text-right">{p}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Price</TableCell>
                    {PERIODS.map((p) => <TableCell key={p} className="text-right"><Change value={e.priceReturns[p]} /></TableCell>)}
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Total</TableCell>
                    {PERIODS.map((p) => <TableCell key={p} className="text-right"><Change value={e.totalReturns[p]} /></TableCell>)}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No metrics for {ticker} yet.</p>
      )}
    </>
  );
}
