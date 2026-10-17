import { createPgliteDb, migrate, type Db } from "@/lib/db";
import type { EmailMessage, EmailTransport } from "@/lib/email";
import { EmailError } from "@/lib/email";
import { TICKERS } from "@/lib/etfs";
import { isTradingDay } from "@/lib/market/calendar";
import { addDays } from "@/lib/market/time";
import type { ProviderSet } from "@/lib/providers";
import type { DailyBar, PrimaryProvider, Quote, SecondaryCloseProvider } from "@/lib/providers/types";

export async function testDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}

/** Deterministic synthetic test fixture (tests only — never used by the app). */
export function syntheticBars(start: string, end: string, base = 100): DailyBar[] {
  const out: DailyBar[] = [];
  let d = start;
  let i = 0;
  while (d <= end) {
    if (isTradingDay(d)) {
      const close = Math.round(base * (1 + 0.0005 * i + 0.01 * Math.sin(i / 7)) * 100) / 100;
      out.push({ date: d, open: close, high: close * 1.005, low: close * 0.995, close, volume: 1_000_000, adjOpen: null, adjHigh: null, adjLow: null, adjClose: close, divCash: 0, splitFactor: 1 });
      i++;
    }
    d = addDays(d, 1);
  }
  return out;
}

export class FakePrimary implements PrimaryProvider {
  name = "FakePrimary";
  history = new Map<string, DailyBar[]>();
  quotes = new Map<string, Quote>();
  historyCalls = 0;
  constructor(start: string, end: string) {
    TICKERS.forEach((t, k) => this.history.set(t, syntheticBars(start, end, 100 + k * 10)));
  }
  /** Replace the close of the final bar so it moves `pct` vs the prior close. */
  setLastMove(ticker: string, pct: number) {
    const bars = this.history.get(ticker)!;
    const prev = bars[bars.length - 2].close;
    const close = Math.round(prev * (1 + pct / 100) * 100) / 100;
    bars[bars.length - 1] = { ...bars[bars.length - 1], close, adjClose: close, open: close, high: close, low: close };
  }
  lastClose(ticker: string) {
    const b = this.history.get(ticker)!;
    return b[b.length - 1].close;
  }
  async getDailyHistory(ticker: string, startDate: string) {
    this.historyCalls++;
    return (this.history.get(ticker) ?? []).filter((b) => b.date >= startDate);
  }
  async getQuotes(tickers: string[]) {
    return tickers.map((t) => this.quotes.get(t)).filter((q): q is Quote => !!q);
  }
}

export class FakeSecondary implements SecondaryCloseProvider {
  name = "FakeSecondary";
  overrides = new Map<string, number | null>();
  constructor(private primary: FakePrimary) {}
  async getCloses(tickers: string[], date: string) {
    const m = new Map<string, number>();
    for (const t of tickers) {
      const bar = this.primary.history.get(t)!.find((b) => b.date === date);
      const v = this.overrides.has(t) ? this.overrides.get(t) : bar?.close;
      if (v) m.set(t, v);
    }
    return m;
  }
}

export function providers(primary: FakePrimary, secondary: FakeSecondary | null): ProviderSet {
  return { primary, secondaryClose: secondary, secondaryQuote: null, missing: [] };
}

export class FakeTransport implements EmailTransport {
  name = "Fake";
  sent: EmailMessage[] = [];
  failures = 0;
  retryable = false;
  async send(msg: EmailMessage) {
    if (this.failures > 0) {
      this.failures--;
      throw new EmailError("simulated outage", this.retryable);
    }
    this.sent.push(msg);
    return { id: `msg-${this.sent.length}` };
  }
}
