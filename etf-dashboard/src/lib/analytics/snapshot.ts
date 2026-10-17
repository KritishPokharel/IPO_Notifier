import type { Db } from "../db";
import { ETFS, ETF_BY_TICKER } from "../etfs";
import { expenseInfo, latestObservations, loadBars, previousSessionSnapshot, type StoredBar } from "../repo";
import { generateAnalysis } from "./analysis";
import { computeEtfMetrics, type EtfMetrics, type LatestPrice } from "./metrics";
import type { Snapshot } from "./snapshot-types";

/** Use whichever is newer: the latest observation, or the latest stored official close. */
export function pickLatest(obs: LatestPrice | undefined, bars: StoredBar[]): LatestPrice | null {
  const last = bars[bars.length - 1];
  if (last && (!obs || last.date > obs.sessionDate)) {
    return {
      price: last.close,
      kind: "close",
      sessionDate: last.date,
      slot: "history",
      source: last.source,
      priceField: "Official close",
      quoteTimestamp: null,
      retrievedAt: last.retrievedAt,
      isDelayed: false,
      status: last.verificationStatus,
      issues: last.verificationNote ? [{ code: "note", severity: last.verificationStatus === "disputed" ? "error" : "info", message: last.verificationNote }] : [],
      secondarySource: last.verificationSource,
      secondaryPrice: last.verificationClose,
      discrepancyPct: last.verificationDiffPct,
    };
  }
  return obs ?? null;
}

export async function computeAllMetrics(db: Pick<Db, "query">, through?: string): Promise<EtfMetrics[]> {
  const tickers = ETFS.map((e) => e.ticker);
  const [bars, obs, expense] = await Promise.all([loadBars(db, tickers, through), latestObservations(db, through), expenseInfo(db)]);
  return tickers.map((t) => {
    const b = bars.get(t) ?? [];
    return computeEtfMetrics(ETF_BY_TICKER[t], b, pickLatest(obs.get(t), b), expense.get(t)!);
  });
}

export async function buildSnapshot(db: Pick<Db, "query">, sessionDate: string, slot: string, now = new Date()): Promise<Snapshot> {
  const etfs = await computeAllMetrics(db, sessionDate);
  const kinds = new Set(etfs.filter((e) => e.latest?.sessionDate === sessionDate).map((e) => e.latest!.kind));
  const basis: Snapshot["basis"] = kinds.size === 1 && kinds.has("close") ? "final-close" : kinds.has("close") ? "mixed" : "intraday";
  const prev = await previousSessionSnapshot(db, sessionDate);
  const analysis = generateAnalysis(etfs, prev?.etfs ?? null, sessionDate, basis === "final-close" ? "final-close" : "intraday", now);
  return { version: 1, sessionDate, slot, computedAt: now.toISOString(), basis, etfs, analysis };
}
