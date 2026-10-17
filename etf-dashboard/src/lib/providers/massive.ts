import { fetchJson, finiteOrNull } from "./http";
import type { SecondaryCloseProvider } from "./types";
import { ProviderError } from "./types";

interface GroupedResponse {
  status?: string;
  resultsCount?: number;
  results?: { T: string; c: number; o?: number; h?: number; l?: number; v?: number; t?: number }[];
}

/**
 * Massive (formerly Polygon.io) grouped daily bars: one request returns the
 * unadjusted daily bar for every U.S. ticker. Free tier: 5 requests/minute, end-of-day data.
 */
export class MassiveCloseProvider implements SecondaryCloseProvider {
  name = "Massive (Polygon.io)";
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.MASSIVE_BASE_URL || "https://api.polygon.io",
    private readonly fetchImpl?: typeof fetch,
  ) {
    if (!apiKey) throw new ProviderError("MASSIVE_API_KEY is not configured");
  }

  async getCloses(tickers: string[], date: string): Promise<Map<string, number>> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=false&apiKey=${encodeURIComponent(this.apiKey)}`;
    const data = await fetchJson<GroupedResponse>(url, { redact: [this.apiKey], fetchImpl: this.fetchImpl, retries: 2 });
    const wanted = new Set(tickers.map((t) => t.toUpperCase()));
    const out = new Map<string, number>();
    for (const r of data.results ?? []) {
      const c = finiteOrNull(r.c);
      if (wanted.has(r.T) && c !== null) out.set(r.T, c);
    }
    return out;
  }
}
