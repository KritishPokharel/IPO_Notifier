export interface DailyBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjClose: number | null;
  divCash: number;
  splitFactor: number;
}

export interface QuoteCandidate {
  price: number | null;
  field: string;
  timestamp: string | null;
}

export interface Quote {
  ticker: string;
  source: string;
  /** Candidates in order of preference (e.g. last trade, then midpoint). */
  candidates: QuoteCandidate[];
  prevClose: number | null;
  isDelayed: boolean;
}

export interface PrimaryProvider {
  name: string;
  getDailyHistory(ticker: string, startDate: string, endDate?: string): Promise<DailyBar[]>;
  getQuotes(tickers: string[]): Promise<Quote[]>;
}

export interface SecondaryCloseProvider {
  name: string;
  /** Official (unadjusted) closing prices for the given session. Missing tickers are omitted. */
  getCloses(tickers: string[], date: string): Promise<Map<string, number>>;
}

export interface SecondaryQuoteProvider {
  name: string;
  getQuotes(tickers: string[]): Promise<Quote[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
