import { fetchJson, finiteOrNull, sleep } from "./http";
import type { Quote, SecondaryCloseProvider, SecondaryQuoteProvider } from "./types";
import { ProviderError } from "./types";

const BASE = "https://api.twelvedata.com";

interface TdValue {
  datetime: string;
  close: string;
}
interface TdSeries {
  status?: string;
  message?: string;
  meta?: { symbol: string };
  values?: TdValue[];
}
interface TdQuote {
  symbol?: string;
  status?: string;
  message?: string;
  close?: string;
  previous_close?: string;
  timestamp?: number;
  last_quote_at?: number;
  datetime?: string;
}

/**
 * Twelve Data. Free tier: 800 credits/day, 8 credits/minute (one credit per symbol),
 * so requests are batched in groups of 8 with a pause between batches.
 */
export class TwelveDataProvider implements SecondaryCloseProvider, SecondaryQuoteProvider {
  name = "Twelve Data";
  constructor(
    private readonly apiKey: string,
    private readonly batchSize = Number(process.env.TWELVEDATA_BATCH_SIZE ?? 8),
    private readonly batchPauseMs = Number(process.env.TWELVEDATA_BATCH_PAUSE_MS ?? 61_000),
    private readonly fetchImpl?: typeof fetch,
  ) {
    if (!apiKey) throw new ProviderError("TWELVEDATA_API_KEY is not configured");
  }

  private async batched<T>(tickers: string[], fn: (batch: string[]) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < tickers.length; i += this.batchSize) {
      if (i > 0) await sleep(this.batchPauseMs);
      out.push(...(await fn(tickers.slice(i, i + this.batchSize))));
    }
    return out;
  }

  private byS<T>(data: unknown, batch: string[]): Record<string, T> {
    if (batch.length === 1) return { [batch[0]]: data as T };
    return data as Record<string, T>;
  }

  async getCloses(tickers: string[], date: string): Promise<Map<string, number>> {
    const rows = await this.batched(tickers, async (batch) => {
      const qs = new URLSearchParams({
        symbol: batch.join(","),
        interval: "1day",
        adjust: "none", // Compare unadjusted session closes, matching Tiingo close.
        outputsize: "10",
        end_date: `${date} 23:59:59`,
        timezone: "America/New_York",
        apikey: this.apiKey,
      });
      const data = await fetchJson<unknown>(`${BASE}/time_series?${qs}`, { redact: [this.apiKey], fetchImpl: this.fetchImpl });
      const by = this.byS<TdSeries>(data, batch);
      return batch.map((t) => {
        const v = by[t]?.values?.find((x) => x.datetime.slice(0, 10) === date);
        return [t, v ? finiteOrNull(v.close) : null] as const;
      });
    });
    const out = new Map<string, number>();
    for (const [t, c] of rows) if (c !== null) out.set(t, c);
    return out;
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    return this.batched(tickers, async (batch) => {
      const qs = new URLSearchParams({ symbol: batch.join(","), apikey: this.apiKey });
      const data = await fetchJson<unknown>(`${BASE}/quote?${qs}`, { redact: [this.apiKey], fetchImpl: this.fetchImpl });
      const by = this.byS<TdQuote>(data, batch);
      return batch.map((t) => {
        const q = by[t] ?? {};
        const ts = q.last_quote_at ?? q.timestamp;
        return {
          ticker: t,
          source: "Twelve Data",
          isDelayed: false,
          prevClose: finiteOrNull(q.previous_close),
          candidates: [
            {
              price: q.status === "error" ? null : finiteOrNull(q.close),
              field: "Latest price",
              timestamp: ts ? new Date(ts * 1000).toISOString() : null,
            },
          ],
        };
      });
    });
  }
}
