import type { EtfDefinition } from "../etfs";
import { annualFee } from "../etfs";
import { previousTradingDay } from "../market/calendar";
import type { DataStatus, Issue } from "../validation";
import {
  PERIODS,
  SESSIONS,
  WINDOW_30D,
  WINDOW_52W,
  WINDOW_90D,
  annualizedVolatility,
  classifyDrawdown,
  dailyChange,
  dailyStdevPct,
  drawdownFromHigh,
  maxDrawdownWithDates,
  periodReturn,
  round,
  sma,
  splitAdjust,
  streak,
  windowExtremes,
  ytdReturn,
  type DrawdownClass,
  type Period,
  type RawBar,
} from "./calc";

export interface LatestPrice {
  price: number;
  kind: "intraday" | "close";
  sessionDate: string;
  slot: string;
  source: string;
  priceField: string | null;
  quoteTimestamp: string | null;
  retrievedAt: string | null;
  isDelayed: boolean;
  status: DataStatus;
  issues: Issue[];
  secondarySource: string | null;
  secondaryPrice: number | null;
  discrepancyPct: number | null;
}

export interface ExpenseInfo {
  ratio: number;
  status: "reference" | "verified";
  source: string | null;
  verifiedAt: string | null;
}

type Ext = { value: number; date: string } | null;

export interface EtfMetrics {
  ticker: string;
  name: string;
  category: string;
  group: string;
  focus: string;
  concentrationRisk: string;
  expense: ExpenseInfo;
  annualFeePer10k: number;

  price: number | null;
  latest: LatestPrice | null;
  status: DataStatus;
  statusNote: string | null;

  prevClose: number | null;
  prevCloseDate: string | null;
  dailyChange: number | null;
  dailyChangePct: number | null;

  high52w: Ext;
  low52w: Ext;
  pctFromHigh52w: number | null; // negative = below high
  pctAboveLow52w: number | null;
  rangePosition52w: number | null; // 0 = at low, 1 = at high
  drawdownClass: DrawdownClass | null;
  high30d: Ext;
  low30d: Ext;
  high90d: Ext;
  low90d: Ext;
  allTimeHigh: Ext;
  allTimeLow: Ext;
  historyStart: string | null;
  historySessions: number;

  priceReturns: Record<Period, number | null>;
  totalReturns: Record<Period, number | null>;
  totalReturnsAsOf: string | null;

  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  pctFromMa200: number | null;
  vol20d: number | null;
  vol1y: number | null;
  dailyStdev1y: number | null;
  /** Today's move measured in 1-year daily standard deviations. */
  dailyZ: number | null;
  maxDrawdown1y: { pct: number; peakDate?: string; troughDate?: string } | null;
  maxDrawdownAll: { pct: number; peakDate?: string; troughDate?: string } | null;
  streak: { direction: "up" | "down" | "flat"; count: number };
}

function emptyReturns(): Record<Period, number | null> {
  return Object.fromEntries(PERIODS.map((p) => [p, null])) as Record<Period, number | null>;
}

function returnsFor(dates: string[], values: number[]): Record<Period, number | null> {
  const r = emptyReturns();
  for (const p of PERIODS) {
    r[p] = round(p === "YTD" ? ytdReturn(dates, values) : periodReturn(values, SESSIONS[p as keyof typeof SESSIONS]));
  }
  return r;
}

function ext(e: { value: number; date: string } | undefined | null): Ext {
  return e ? { value: round(e.value, 4)!, date: e.date } : null;
}

/**
 * Compute all metrics for one ETF from stored daily bars plus the latest
 * validated observation. Fully deterministic given the inputs.
 */
export function computeEtfMetrics(def: EtfDefinition, bars: RawBar[], latest: LatestPrice | null, expense: ExpenseInfo): EtfMetrics {
  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  const adj = splitAdjust(sorted);
  const base: EtfMetrics = {
    ticker: def.ticker,
    name: def.name,
    category: def.category,
    group: def.group,
    focus: def.focus,
    concentrationRisk: def.concentrationRisk,
    expense,
    annualFeePer10k: round(annualFee(10_000, expense.ratio), 2)!,
    price: null,
    latest,
    status: "pending",
    statusNote: null,
    prevClose: null,
    prevCloseDate: null,
    dailyChange: null,
    dailyChangePct: null,
    high52w: null,
    low52w: null,
    pctFromHigh52w: null,
    pctAboveLow52w: null,
    rangePosition52w: null,
    drawdownClass: null,
    high30d: null,
    low30d: null,
    high90d: null,
    low90d: null,
    allTimeHigh: null,
    allTimeLow: null,
    historyStart: sorted[0]?.date ?? null,
    historySessions: sorted.length,
    priceReturns: emptyReturns(),
    totalReturns: emptyReturns(),
    totalReturnsAsOf: null,
    ma20: null,
    ma50: null,
    ma200: null,
    pctFromMa200: null,
    vol20d: null,
    vol1y: null,
    dailyStdev1y: null,
    dailyZ: null,
    maxDrawdown1y: null,
    maxDrawdownAll: null,
    streak: { direction: "flat", count: 0 },
  };
  if (!latest || !adj.length) {
    base.statusNote = adj.length ? "No validated price observation yet." : "No historical data loaded yet.";
    return base;
  }

  // Completed sessions strictly before the observation's session, plus the observation itself.
  const before = adj.filter((b) => b.date < latest.sessionDate);
  const sessionBar = adj.find((b) => b.date === latest.sessionDate) ?? null;
  const prev = before[before.length - 1] ?? null;

  const dates = before.map((b) => b.date);
  const prices = before.map((b) => b.sClose);
  // Split-adjust the current observation relative to the stored series.
  const curSplit = sessionBar?.splitFactor && sessionBar.splitFactor !== 1 ? sessionBar.splitFactor : 1;
  dates.push(latest.sessionDate);
  prices.push(latest.price);
  // If a split happened today, earlier prices must be divided by its factor.
  if (curSplit !== 1) for (let i = 0; i < prices.length - 1; i++) prices[i] /= curSplit;

  base.price = latest.price;
  base.status = latest.status;
  base.statusNote = latest.issues.find((i) => i.severity !== "info")?.message ?? null;

  if (prev) {
    const prevRaw = prev.close / curSplit;
    base.prevClose = round(prevRaw, 4);
    base.prevCloseDate = prev.date;
    const ch = dailyChange(latest.price, prevRaw);
    base.dailyChange = round(ch.abs, 4);
    base.dailyChangePct = round(ch.pct, 4);
    const expectedPrev = previousTradingDay(latest.sessionDate);
    if (prev.date !== expectedPrev) {
      base.status = "pending";
      base.statusNote = `Previous session close (${expectedPrev}) is missing; daily change is not reliable until it is loaded.`;
    }
  }

  const w52 = windowExtremes(dates, prices, prices, WINDOW_52W);
  const w30 = windowExtremes(dates, prices, prices, WINDOW_30D);
  const w90 = windowExtremes(dates, prices, prices, WINDOW_90D);
  const all = windowExtremes(dates, prices, prices, prices.length);
  if (w52) {
    base.high52w = ext(w52.high);
    base.low52w = ext(w52.low);
    const dd = drawdownFromHigh(latest.price, w52.high.value);
    base.pctFromHigh52w = round(dd);
    base.pctAboveLow52w = round(((latest.price - w52.low.value) / w52.low.value) * 100);
    const span = w52.high.value - w52.low.value;
    base.rangePosition52w = span > 0 ? round((latest.price - w52.low.value) / span) : 1;
    base.drawdownClass = classifyDrawdown(-dd);
  }
  base.high30d = ext(w30?.high);
  base.low30d = ext(w30?.low);
  base.high90d = ext(w90?.high);
  base.low90d = ext(w90?.low);
  base.allTimeHigh = ext(all?.high);
  base.allTimeLow = ext(all?.low);

  base.priceReturns = returnsFor(dates, prices);
  // Total returns use the provider's dividend-adjusted closes for completed sessions only.
  const completed = adj.filter((b) => b.date <= latest.sessionDate && (latest.kind === "close" || b.date < latest.sessionDate));
  if (completed.length) {
    base.totalReturns = returnsFor(
      completed.map((b) => b.date),
      completed.map((b) => b.tClose),
    );
    base.totalReturnsAsOf = completed[completed.length - 1].date;
  }

  base.ma20 = round(sma(prices, 20));
  base.ma50 = round(sma(prices, 50));
  base.ma200 = round(sma(prices, 200));
  base.pctFromMa200 = base.ma200 ? round(((latest.price - base.ma200) / base.ma200) * 100) : null;
  base.vol20d = round(annualizedVolatility(prices, 20));
  base.vol1y = round(annualizedVolatility(prices, 252));
  // Daily stdev excludes today's move so the z-score is measured against prior history.
  base.dailyStdev1y = round(dailyStdevPct(prices.slice(0, -1), 252));
  base.dailyZ =
    base.dailyStdev1y && base.dailyChangePct !== null ? round(base.dailyChangePct / base.dailyStdev1y, 2) : null;
  const last1y = Math.max(0, prices.length - WINDOW_52W);
  base.maxDrawdown1y = roundDd(maxDrawdownWithDates(prices.slice(last1y), dates.slice(last1y)));
  base.maxDrawdownAll = roundDd(maxDrawdownWithDates(prices, dates));
  base.streak = streak(prices);
  return base;
}

function roundDd(d: { pct: number; peakDate?: string; troughDate?: string }) {
  return { ...d, pct: round(d.pct)! };
}
