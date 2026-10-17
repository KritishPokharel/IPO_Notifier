import { splitAdjust } from "./analytics/calc";
import type { Db } from "./db";
import { loadBars, observationsForTicker } from "./repo";
import { addDays } from "./market/time";

/** Compact chart payload: split-adjusted OHLC (price basis), dividend-adjusted close and volume. */
export interface HistoryPayload {
  ticker: string;
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  rawClose: number[];
  totalClose: number[];
  volume: (number | null)[];
  status: string[];
  intraday: { time: string; price: number; kind: string; status: string; source: string; slot: string; sessionDate: string }[];
}

const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

export async function loadHistory(db: Pick<Db, "query">, ticker: string): Promise<HistoryPayload> {
  const bars = (await loadBars(db, [ticker])).get(ticker) ?? [];
  const adj = splitAdjust(bars);
  const last = bars[bars.length - 1]?.date;
  const obs = last ? await observationsForTicker(db, ticker, addDays(last, -10)) : [];
  return {
    ticker,
    dates: adj.map((b) => b.date),
    open: adj.map((b) => r4(b.sOpen)),
    high: adj.map((b) => r4(b.sHigh)),
    low: adj.map((b) => r4(b.sLow)),
    close: adj.map((b) => r4(b.sClose)),
    rawClose: adj.map((b) => b.close),
    totalClose: adj.map((b) => r4(b.tClose)),
    volume: adj.map((b) => b.volume),
    status: bars.map((b) => b.verificationStatus),
    intraday: obs
      .filter((o) => o.quoteTimestamp)
      .map((o) => ({ time: o.quoteTimestamp!, price: o.price, kind: o.kind, status: o.status, source: o.source, slot: o.slot, sessionDate: o.sessionDate })),
  };
}
