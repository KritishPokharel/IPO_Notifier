import Link from "next/link";
import { Change, DrawdownBadge, StatusBadge } from "@/components/dashboard/badges";
import { Empty, PageHeader } from "@/components/dashboard/empty";
import { SetupNotice } from "@/components/dashboard/market-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildWatchlist } from "@/lib/analytics/watchlist";
import { getDashboardData } from "@/lib/data";
import { getDb } from "@/lib/db";
import { fmtPrice } from "@/lib/format";
import { DEFAULT_WATCHLIST_SETTINGS, getWatchlistSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const data = await getDashboardData();
  const settings = await getWatchlistSettings(await getDb()).catch(() => DEFAULT_WATCHLIST_SETTINGS);
  const list = data.snapshot ? buildWatchlist(data.snapshot.etfs, settings) : [];
  return (
    <>
      <PageHeader
        title="Watchlist & research flags"
        description="ETFs meeting objective conditions you may want to research further. These are flags, not buy or sell recommendations."
      />
      <SetupNotice data={data} />
      <p className="text-xs text-muted-foreground">
        Flags: decline from 52W high beyond {settings.drawdownLevels.join("% / ")}% · within {settings.near90dLowPct}% of 90-day low · within{" "}
        {settings.near52wLowPct}% of 52-week low · below 200-day average · daily move beyond {settings.unusualSigma}σ of 1-year volatility. Thresholds
        are editable under Alert Settings.
      </p>
      {data.snapshot ? (
        list.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map(({ etf: e, flags }) => (
              <Card key={e.ticker}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <Link href={`/etf/${e.ticker}`} className="hover:underline">{e.ticker}</Link>
                    <StatusBadge status={e.status} note={e.statusNote} />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{e.name}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="tabular-nums">{fmtPrice(e.price)} <Change value={e.dailyChangePct} className="text-xs" /></span>
                    <DrawdownBadge cls={e.drawdownClass} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {flags.map((f) => (
                      <Badge key={f.code} variant="outline" className={f.severity >= 3 ? "border-red-500/40 text-red-400" : f.severity === 2 ? "border-amber-500/40 text-amber-500" : ""}>
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Empty>No ETF currently meets any research-flag condition.</Empty>
        )
      ) : null}
    </>
  );
}
