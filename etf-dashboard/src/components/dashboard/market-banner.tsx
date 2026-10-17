import type { DashboardData } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { formatEt } from "@/lib/market/time";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";

const PHASE_TEXT = { open: "Market open", "pre-market": "Pre-market", "after-hours": "After hours", closed: "Market closed" } as const;

export function MarketBanner({ data }: { data: DashboardData }) {
  const { market, snapshot, lastUpdate } = data;
  const basis = snapshot?.basis === "final-close" ? "official closing prices" : snapshot?.basis === "mixed" ? "mixed close/intraday data" : "intraday prices";
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-block size-2 rounded-full", market.phase === "open" ? "bg-emerald-500" : "bg-muted-foreground")} />
          <span className="font-medium">{PHASE_TEXT[market.phase]}</span>
          {market.holiday && !market.isTradingDay ? <span className="text-muted-foreground">· {market.holiday}</span> : null}
          {market.earlyClose ? <span className="text-amber-500">· Early close today (1:00 PM ET): {market.earlyClose}</span> : null}
        </div>
        {snapshot ? (
          <p className="text-muted-foreground">
            Showing {basis} for the <span className="text-foreground">{fmtDate(snapshot.sessionDate)}</span> session
            {market.phase !== "open" && snapshot.sessionDate === market.lastCompletedSession ? " (most recent completed session)" : ""}.
            {" "}Last successful update: {lastUpdate?.finished_at ? `${formatEt(lastUpdate.finished_at)} ET` : "none yet"}.
          </p>
        ) : (
          <p className="text-muted-foreground">No market data stored yet.</p>
        )}
      </div>
      <RefreshButton />
    </div>
  );
}

export function SetupNotice({ data }: { data: DashboardData }) {
  if (data.error) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
        Could not load data from the database: {data.error}
      </div>
    );
  }
  if (data.snapshot) return null;
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-medium text-amber-500">No market data yet</p>
      <p className="mt-1 text-muted-foreground">
        {data.missingConfig.length
          ? `Configure ${data.missingConfig.join(", ")} and then run `
          : "Run "}
        <code className="rounded bg-muted px-1">npm run job:backfill</code> to load daily history, or wait for the next scheduled update. No
        placeholder prices are shown. See the README for setup.
      </p>
    </div>
  );
}
