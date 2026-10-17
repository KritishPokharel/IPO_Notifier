/** Pure financial calculations. Inputs are ordered oldest → newest. */

export const SESSIONS = {
  "1W": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  "3Y": 756,
  "5Y": 1260,
} as const;
export type Period = keyof typeof SESSIONS | "YTD";
export const PERIODS: Period[] = ["1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"];

export const WINDOW_30D = 21;
export const WINDOW_90D = 63;
export const WINDOW_52W = 252;

export function round(v: number | null, dp = 4): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export function dailyChange(price: number, prevClose: number): { abs: number; pct: number } {
  return { abs: price - prevClose, pct: ((price - prevClose) / prevClose) * 100 };
}

/** Return over the last `n` sessions; null when history is too short. */
export function periodReturn(values: number[], n: number): number | null {
  const i = values.length - 1 - n;
  if (i < 0 || values.length === 0) return null;
  return (values[values.length - 1] / values[i] - 1) * 100;
}

/** Year-to-date: versus the last close of the previous calendar year. */
export function ytdReturn(dates: string[], values: number[]): number | null {
  if (!values.length) return null;
  const year = dates[dates.length - 1].slice(0, 4);
  let idx = -1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i].slice(0, 4) < year) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  return (values[values.length - 1] / values[idx] - 1) * 100;
}

export interface Extreme {
  value: number;
  date: string;
}

export function windowExtremes(dates: string[], highs: number[], lows: number[], window: number): { high: Extreme; low: Extreme } | null {
  if (!dates.length) return null;
  const start = Math.max(0, dates.length - window);
  let hi = start;
  let lo = start;
  for (let i = start; i < dates.length; i++) {
    if (highs[i] > highs[hi]) hi = i;
    if (lows[i] < lows[lo]) lo = i;
  }
  return { high: { value: highs[hi], date: dates[hi] }, low: { value: lows[lo], date: dates[lo] } };
}

export function sma(values: number[], n: number): number | null {
  if (values.length < n || n <= 0) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

/** Simple moving average series aligned to input (null until enough data). */
export function smaSeries(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= n) s -= values[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function logReturns(values: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < values.length; i++) r.push(Math.log(values[i] / values[i - 1]));
  return r;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Annualized historical volatility (%) of daily log returns over the last `n` returns. */
export function annualizedVolatility(values: number[], n: number): number | null {
  if (values.length < n + 1) return null;
  const sd = stdev(logReturns(values.slice(values.length - n - 1)));
  return sd === null ? null : sd * Math.sqrt(252) * 100;
}

/** Daily standard deviation (%) of simple returns over the last `n` returns. */
export function dailyStdevPct(values: number[], n: number): number | null {
  if (values.length < n + 1) return null;
  const slice = values.slice(values.length - n - 1);
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push((slice[i] / slice[i - 1] - 1) * 100);
  return stdev(rets);
}

export function drawdownSeries(values: number[]): number[] {
  let peak = -Infinity;
  return values.map((v) => {
    peak = Math.max(peak, v);
    return ((v - peak) / peak) * 100;
  });
}

/** Maximum peak-to-trough decline (%), as a negative number (0 if none). */
export function maxDrawdown(values: number[]): { pct: number; peakDate?: string; troughDate?: string } {
  return maxDrawdownWithDates(values, []);
}

export function maxDrawdownWithDates(values: number[], dates: string[]): { pct: number; peakDate?: string; troughDate?: string } {
  let peak = -Infinity;
  let peakIdx = 0;
  let worst = 0;
  let worstPeak = 0;
  let worstTrough = 0;
  values.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = ((v - peak) / peak) * 100;
    if (dd < worst) {
      worst = dd;
      worstPeak = peakIdx;
      worstTrough = i;
    }
  });
  return { pct: worst, peakDate: dates[worstPeak], troughDate: dates[worstTrough] };
}

/** Drawdown (%) = ((Current Price - 52-Week High) / 52-Week High) × 100. */
export function drawdownFromHigh(price: number, high: number): number {
  return ((price - high) / high) * 100;
}

export type DrawdownClass =
  | "Near high"
  | "Mild pullback"
  | "Moderate correction"
  | "Significant correction"
  | "Bear-market territory"
  | "Severe drawdown";

export const DRAWDOWN_CLASSES: DrawdownClass[] = [
  "Near high",
  "Mild pullback",
  "Moderate correction",
  "Significant correction",
  "Bear-market territory",
  "Severe drawdown",
];

/** `declinePct` is the positive percentage below the 52-week high. */
export function classifyDrawdown(declinePct: number): DrawdownClass {
  const d = Math.max(0, declinePct);
  if (d < 5) return "Near high";
  if (d < 10) return "Mild pullback";
  if (d < 15) return "Moderate correction";
  if (d < 20) return "Significant correction";
  if (d < 30) return "Bear-market territory";
  return "Severe drawdown";
}

export function streak(values: number[]): { direction: "up" | "down" | "flat"; count: number } {
  if (values.length < 2) return { direction: "flat", count: 0 };
  const sign = (i: number) => Math.sign(values[i] - values[i - 1]);
  const last = sign(values.length - 1);
  if (last === 0) return { direction: "flat", count: 0 };
  let count = 0;
  for (let i = values.length - 1; i >= 1 && sign(i) === last; i--) count++;
  return { direction: last > 0 ? "up" : "down", count };
}

/** Daily alert rule: strictly more than `thresholdPct` below the previous close. */
export function breachesDailyDrop(changePct: number, thresholdPct: number): boolean {
  return round(changePct, 6)! < -thresholdPct;
}

export interface RawBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  adjClose: number | null;
  splitFactor: number;
}

export interface AdjustedBar extends RawBar {
  /** Prices adjusted for splits only (price-return basis). */
  sClose: number;
  sOpen: number;
  sHigh: number;
  sLow: number;
  /** Split- and dividend-adjusted close (total-return basis). */
  tClose: number;
}

/**
 * Split-adjust raw bars: every price before an ex-split session is divided by
 * the cumulative split factor of all later sessions.
 */
export function splitAdjust(bars: RawBar[]): AdjustedBar[] {
  const out: AdjustedBar[] = new Array(bars.length);
  let factor = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    const sClose = b.close / factor;
    out[i] = {
      ...b,
      sClose,
      sOpen: (b.open ?? b.close) / factor,
      sHigh: (b.high ?? b.close) / factor,
      sLow: (b.low ?? b.close) / factor,
      tClose: b.adjClose ?? sClose,
    };
    if (b.splitFactor && b.splitFactor !== 1) factor *= b.splitFactor;
  }
  return out;
}
