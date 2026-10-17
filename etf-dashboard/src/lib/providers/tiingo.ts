import { fetchJson, finiteOrNull } from "./http";
import type { DailyBar, PrimaryProvider, Quote } from "./types";
import { ProviderError } from "./types";

const BASE = "https://api.tiingo.com";

interface TiingoDaily {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjOpen: number;
  adjHigh: number;
  adjLow: number;
  adjClose: number;
  divCash: number;
  splitFactor: number;
}

interface TiingoIex {
  ticker: string;
  timestamp: string | null;
  lastSaleTimestamp: string | null;
  quoteTimestamp: string | null;
  last: number | null;
  tngoLast: number | null;
  prevClose: number | null;
  mid: number | null;
  bidPrice: number | null;
  askPrice: number | null;
}

/**
 * Tiingo: end-of-day prices (official closes, split/dividend-adjusted series) and
 * IEX real-time quotes. Free tier: 1,000 requests/day, 50/hour, 500 unique symbols/month.
 */
export class TiingoProvider implements PrimaryProvider {
  name = "Tiingo";
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl?: typeof fetch,
  ) {
    if (!apiKey) throw new ProviderError("TIINGO_API_KEY is not configured");
  }

  private get(path: string) {
    return fetchJson<unknown>(`${BASE}${path}`, {
      headers: { Authorization: `Token ${this.apiKey}`, "Content-Type": "application/json" },
      redact: [this.apiKey],
      fetchImpl: this.fetchImpl,
    });
  }

  async getDailyHistory(ticker: string, startDate: string, endDate?: string): Promise<DailyBar[]> {
    const qs = new URLSearchParams({ startDate, format: "json", resampleFreq: "daily" });
    if (endDate) qs.set("endDate", endDate);
    const data = await this.get(`/tiingo/daily/${encodeURIComponent(ticker.toLowerCase())}/prices?${qs}`);
    if (!Array.isArray(data)) {
      throw new ProviderError(`Unexpected Tiingo daily response for ${ticker}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return (data as TiingoDaily[]).map((r) => ({
      date: String(r.date).slice(0, 10),
      open: finiteOrNull(r.open),
      high: finiteOrNull(r.high),
      low: finiteOrNull(r.low),
      close: Number(r.close),
      volume: finiteOrNull(r.volume),
      adjOpen: finiteOrNull(r.adjOpen),
      adjHigh: finiteOrNull(r.adjHigh),
      adjLow: finiteOrNull(r.adjLow),
      adjClose: finiteOrNull(r.adjClose),
      divCash: finiteOrNull(r.divCash) ?? 0,
      splitFactor: finiteOrNull(r.splitFactor) ?? 1,
    }));
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const qs = new URLSearchParams({ tickers: tickers.map((t) => t.toLowerCase()).join(",") });
    const data = await this.get(`/iex/?${qs}`);
    if (!Array.isArray(data)) {
      throw new ProviderError(`Unexpected Tiingo IEX response: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return (data as TiingoIex[]).map((r) => {
      const bid = finiteOrNull(r.bidPrice);
      const ask = finiteOrNull(r.askPrice);
      const mid = bid && ask && bid > 0 && ask > 0 ? (bid + ask) / 2 : finiteOrNull(r.mid);
      return {
        ticker: String(r.ticker).toUpperCase(),
        source: "Tiingo IEX",
        isDelayed: false,
        prevClose: finiteOrNull(r.prevClose),
        candidates: [
          { price: finiteOrNull(r.last), field: "IEX last sale", timestamp: r.lastSaleTimestamp ?? null },
          { price: mid, field: "IEX bid/ask midpoint", timestamp: r.quoteTimestamp ?? null },
        ],
      };
    });
  }
}
