import { z } from "zod";
import type { EtfMetrics } from "../analytics/metrics";
import type { Snapshot } from "../analytics/snapshot-types";
import { marketStatus } from "../market/calendar";

export const profileSchema = z.enum(["balanced", "growth", "defensive"]);
export type Profile = z.infer<typeof profileSchema>;
export const WEIGHTS = {
  balanced: { momentum: 30, stability: 30, resilience: 25, trend: 15 },
  growth: { momentum: 50, stability: 15, resilience: 15, trend: 20 },
  defensive: { momentum: 15, stability: 45, resilience: 30, trend: 10 },
};
export const METHODOLOGY = "Relative percentile scores within eligible tracked ETFs: momentum = 1Y split-adjusted price return; stability = lower 1Y annualized volatility; resilience = smaller 1Y maximum drawdown; trend = distance above 200-day average. Ties share percentile scores; ticker breaks final ties. Fees are shown separately, never scored when unverified. Up to two funds per category limits duplication, but does not measure holdings overlap. Scores are research heuristics, not probabilities or expected returns. Assumes a 5+ year equity investment horizon.";
export interface RankedEtf { etf: EtfMetrics; score: number; factors: Record<keyof typeof WEIGHTS.balanced, number> }
export interface Ranking {
  profile: Profile;
  session: string;
  eligible: number;
  picks: RankedEtf[];
  excluded: { ticker: string; reason: string }[];
}
export function exclusion(e: EtfMetrics, session: string): string | null {
  if (e.status !== "verified" || e.latest?.status !== "verified") return "Latest close has not passed an independent cross-check.";
  if (e.latest.kind !== "close" || e.latest.sessionDate !== session) return `Needs verified closing data for ${session}.`;
  if (!e.latest.secondarySource || e.latest.secondarySource === e.latest.source || !Number.isFinite(e.latest.secondaryPrice) || (e.latest.secondaryPrice ?? 0) <= 0) return "Independent price evidence is missing.";
  if (!Number.isFinite(e.price) || (e.price ?? 0) <= 0) return "Invalid price.";
  if (e.historySessions < 253 || [e.priceReturns["1Y"], e.vol1y, e.maxDrawdown1y?.pct, e.pctFromMa200].some(v => typeof v !== "number" || !Number.isFinite(v))) return "Needs a full year of valid history and risk metrics.";
  return null;
}
function percentile(value: number, values: number[]): number {
  if (values.length <= 1) return 50;
  const less = values.filter(v => v < value).length;
  const equal = values.filter(v => v === value).length;
  return 100 * (less + (equal - 1) / 2) / (values.length - 1);
}
export function rankEtfs(snapshot: Snapshot, profile: Profile, now = new Date(), historyProblems: Record<string, string> = {}): Ranking {
  const session = marketStatus(now).lastCompletedSession;
  const excluded: Ranking["excluded"] = [];
  const candidates = snapshot.etfs.filter(e => {
    const reason = historyProblems[e.ticker] ?? exclusion(e, session);
    if (reason) excluded.push({ ticker: e.ticker, reason });
    return !reason;
  });
  const signals = (e: EtfMetrics) => ({ momentum: e.priceReturns["1Y"]!, stability: -e.vol1y!, resilience: -Math.abs(e.maxDrawdown1y!.pct), trend: e.pctFromMa200! });
  const ranked = candidates.map(etf => {
    const values = signals(etf);
    const factors = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, percentile(value, candidates.map(e => signals(e)[key as keyof typeof values]))])) as RankedEtf["factors"];
    const score = Object.entries(WEIGHTS[profile]).reduce((sum, [key, weight]) => sum + factors[key as keyof typeof factors] * weight / 100, 0);
    return { etf, factors, score: Math.round(score * 10) / 10 };
  }).sort((a, b) => b.score - a.score || a.etf.ticker.localeCompare(b.etf.ticker));
  const counts = new Map<string, number>();
  const picks = ranked.filter(r => {
    const count = counts.get(r.etf.category) ?? 0;
    if (count >= 2) return false;
    counts.set(r.etf.category, count + 1);
    return true;
  }).slice(0, 5);
  return { profile, session, eligible: candidates.length, picks, excluded };
}
