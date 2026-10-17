import type { VerificationConfig } from "./config";
import { REGULAR_OPEN_MIN, sessionCloseMinutes } from "./market/calendar";
import { etParts } from "./market/time";
import type { DailyBar, Quote, QuoteCandidate } from "./providers/types";

export type DataStatus = "verified" | "single_source" | "pending" | "stale" | "disputed";

export const STATUS_LABELS: Record<DataStatus, string> = {
  verified: "Verified",
  single_source: "Single-source validated",
  pending: "Pending",
  stale: "Stale",
  disputed: "Disputed",
};

export const STATUS_DESCRIPTIONS: Record<DataStatus, string> = {
  verified: "Passed validation and an independent cross-check against a second source.",
  single_source: "Passed internal validation but has not been independently cross-checked.",
  pending: "Awaiting new data.",
  stale: "Older than the expected data window.",
  disputed: "Failed validation or sources materially disagree. Not used for alerts.",
};

export interface Issue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export function isValidPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function pctDiff(a: number, b: number): number {
  return ((a - b) / b) * 100;
}

const COMMON_SPLIT_RATIOS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25];

/**
 * Flags day-over-day jumps that look like an unrecorded split / reverse split.
 * `splitFactor` is the provider's split ratio for the session (1 = none).
 */
export function detectSplitDiscontinuity(prevClose: number, close: number, splitFactor: number, maxMovePct: number): Issue | null {
  if (splitFactor && splitFactor !== 1) {
    return {
      code: "split_recorded",
      severity: "info",
      message: `Provider recorded a ${splitFactor}:1 split on this session; comparisons use split-adjusted prices.`,
    };
  }
  const ratio = close / prevClose;
  const movePct = Math.abs(ratio - 1) * 100;
  if (movePct <= maxMovePct) return null;
  const r = ratio >= 1 ? ratio : 1 / ratio;
  const near = COMMON_SPLIT_RATIOS.find((s) => Math.abs(r / s - 1) < 0.04);
  return near
    ? {
        code: "possible_unrecorded_split",
        severity: "error",
        message: `Price changed by a factor of ~${near} versus the previous close with no split recorded; possible split discontinuity.`,
      }
    : {
        code: "large_move",
        severity: "warning",
        message: `One-day move of ${movePct.toFixed(2)}% exceeds the ${maxMovePct}% sanity limit and needs confirmation from a second source.`,
      };
}

export function validateDailyBar(bar: DailyBar, prevClose: number | null, cfg: VerificationConfig): Issue[] {
  const issues: Issue[] = [];
  if (!isValidPrice(bar.close)) {
    issues.push({ code: "invalid_close", severity: "error", message: `Missing, zero, negative or malformed close (${bar.close}).` });
    return issues;
  }
  for (const [k, v] of [["open", bar.open], ["high", bar.high], ["low", bar.low]] as const) {
    if (v !== null && !isValidPrice(v)) {
      issues.push({ code: `invalid_${k}`, severity: "error", message: `Malformed ${k} value (${v}).` });
    }
  }
  if (bar.volume !== null && (!Number.isFinite(bar.volume) || bar.volume < 0)) {
    issues.push({ code: "invalid_volume", severity: "error", message: `Malformed volume (${bar.volume}).` });
  }
  if (isValidPrice(bar.high) && isValidPrice(bar.low)) {
    const eps = 0.005;
    if (bar.low > bar.high + eps) {
      issues.push({ code: "low_above_high", severity: "error", message: "Daily low is above daily high." });
    } else if (bar.close > bar.high + eps || bar.close < bar.low - eps) {
      issues.push({ code: "close_outside_range", severity: "error", message: "Close is outside the day's high/low range." });
    }
  }
  if (prevClose !== null && isValidPrice(prevClose)) {
    const split = detectSplitDiscontinuity(prevClose, bar.close, bar.splitFactor, cfg.maxUnconfirmedMovePct);
    if (split) issues.push(split);
  }
  return issues;
}

export interface CrossCheckResult {
  source: string;
  value: number | null;
  diffPct: number | null;
  outcome: "agree" | "disagree" | "unavailable";
}

export function crossCheck(primary: number, secondary: number | null | undefined, source: string, tolPct: number, tolAbs = 0): CrossCheckResult {
  if (!isValidPrice(secondary)) return { source, value: null, diffPct: null, outcome: "unavailable" };
  const diffPct = pctDiff(primary, secondary);
  const agree = Math.abs(diffPct) <= tolPct || Math.abs(primary - secondary) <= tolAbs;
  return { source, value: secondary, diffPct, outcome: agree ? "agree" : "disagree" };
}

/**
 * Combine validation issues and the cross-check outcome into a status label.
 * "verified" is only possible when an independent source actually agreed.
 */
export function decideStatus(issues: Issue[], check: CrossCheckResult | null): DataStatus {
  if (issues.some((i) => i.severity === "error")) return "disputed";
  if (issues.some((i) => i.code === "stale_quote")) return "stale";
  if (check?.outcome === "disagree") return "disputed";
  if (check?.outcome === "agree") return "verified";
  // Large unconfirmed move without an agreeing second source: do not trust.
  if (issues.some((i) => i.code === "large_move")) return "disputed";
  return "single_source";
}

export interface SelectedQuote {
  candidate: QuoteCandidate | null;
  issues: Issue[];
}

/**
 * Pick the best intraday quote candidate for `sessionDate`: a valid positive price,
 * timestamped during that session's regular hours, and not older than the staleness window.
 */
export function selectQuote(quote: Quote, sessionDate: string, now: Date, cfg: VerificationConfig): SelectedQuote {
  const issues: Issue[] = [];
  const closeMin = sessionCloseMinutes(sessionDate);
  const nowEt = etParts(now);
  const refMinutes = nowEt.date === sessionDate ? Math.min(nowEt.minutesOfDay, closeMin) : closeMin;
  let fallbackStale: QuoteCandidate | null = null;
  for (const c of quote.candidates) {
    if (!isValidPrice(c.price)) continue;
    if (!c.timestamp || Number.isNaN(new Date(c.timestamp).getTime())) continue;
    const ts = etParts(new Date(c.timestamp));
    if (ts.date !== sessionDate) {
      if (ts.date < sessionDate) fallbackStale ??= c;
      continue;
    }
    if (ts.minutesOfDay < REGULAR_OPEN_MIN || ts.minutesOfDay > closeMin) continue;
    const ageMin = refMinutes - (ts.minutesOfDay + ts.second / 60);
    if (ageMin > cfg.maxQuoteAgeMinutes) {
      fallbackStale ??= c;
      continue;
    }
    if (c !== quote.candidates[0]) {
      issues.push({
        code: "fallback_field",
        severity: "info",
        message: `Used ${c.field} because the preferred field was unavailable or stale.`,
      });
    }
    return { candidate: c, issues };
  }
  if (fallbackStale) {
    issues.push({
      code: "stale_quote",
      severity: "warning",
      message: `Latest ${fallbackStale.field} (${fallbackStale.timestamp}) is outside the ${cfg.maxQuoteAgeMinutes}-minute freshness window for the ${sessionDate} session.`,
    });
    return { candidate: fallbackStale, issues };
  }
  issues.push({ code: "no_valid_quote", severity: "error", message: "No valid, timestamped regular-session quote was returned." });
  return { candidate: null, issues };
}
