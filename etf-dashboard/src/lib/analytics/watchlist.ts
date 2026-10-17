import type { WatchlistSettings } from "../settings";
import type { EtfMetrics } from "./metrics";

export interface WatchlistFlag {
  code: string;
  label: string;
  severity: number;
}

export interface WatchlistEntry {
  etf: EtfMetrics;
  flags: WatchlistFlag[];
}

const fmt = (n: number) => `${n.toFixed(1)}%`;

/** Research flags only — never a recommendation. */
export function flagEtf(e: EtfMetrics, s: WatchlistSettings): WatchlistFlag[] {
  const flags: WatchlistFlag[] = [];
  if (e.price === null) return flags;
  const below = e.pctFromHigh52w !== null ? -e.pctFromHigh52w : null;
  if (below !== null) {
    const levels = [...s.drawdownLevels].sort((a, b) => b - a);
    const hit = levels.find((l) => below > l);
    if (hit !== undefined) {
      flags.push({ code: `below_high_${hit}`, label: `More than ${hit}% below 52-week high (${fmt(below)})`, severity: 2 + levels.length - levels.indexOf(hit) });
    }
  }
  if (e.low90d) {
    const above = ((e.price - e.low90d.value) / e.low90d.value) * 100;
    if (above <= s.near90dLowPct) {
      flags.push({ code: "near_90d_low", label: `Within ${s.near90dLowPct}% of 90-day low (${fmt(above)} above)`, severity: 2 });
    }
  }
  if (e.pctAboveLow52w !== null && e.pctAboveLow52w <= s.near52wLowPct) {
    flags.push({ code: "near_52w_low", label: `Within ${s.near52wLowPct}% of 52-week low (${fmt(e.pctAboveLow52w)} above)`, severity: 3 });
  }
  if (e.ma200 !== null && e.price < e.ma200) {
    flags.push({ code: "below_200dma", label: `Below 200-day moving average (${fmt(e.pctFromMa200 ?? 0)})`, severity: 1 });
  }
  if (e.dailyZ !== null && e.dailyZ <= -s.unusualSigma) {
    flags.push({
      code: "unusual_daily_decline",
      label: `Daily decline of ${fmt(e.dailyChangePct ?? 0)} is ${Math.abs(e.dailyZ).toFixed(1)}× its typical daily move`,
      severity: 3,
    });
  }
  const r1m = e.priceReturns["1M"];
  if (r1m !== null && e.dailyStdev1y) {
    const monthlySd = e.dailyStdev1y * Math.sqrt(21);
    if (r1m / monthlySd <= -s.unusualSigma) {
      flags.push({
        code: "unusual_monthly_decline",
        label: `1-month decline of ${fmt(r1m)} is ${Math.abs(r1m / monthlySd).toFixed(1)}× its typical monthly move`,
        severity: 3,
      });
    }
  }
  return flags;
}

export function buildWatchlist(etfs: EtfMetrics[], s: WatchlistSettings): WatchlistEntry[] {
  return etfs
    .map((etf) => ({ etf, flags: flagEtf(etf, s) }))
    .filter((w) => w.flags.length > 0)
    .sort((a, b) => (a.etf.pctFromHigh52w ?? 0) - (b.etf.pctFromHigh52w ?? 0));
}
