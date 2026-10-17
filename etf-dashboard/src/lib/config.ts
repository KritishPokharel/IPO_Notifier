function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface VerificationConfig {
  /** Max % difference between primary and secondary official closes before flagging "disputed". */
  closeTolerancePct: number;
  /** Absolute tolerance (USD) to absorb rounding on low-priced ETFs. */
  closeToleranceAbs: number;
  /** Max % difference between two intraday quotes (taken seconds/minutes apart). */
  intradayTolerancePct: number;
  /** Quotes older than this during regular hours are "stale". */
  maxQuoteAgeMinutes: number;
  /** One-day moves larger than this (without a confirming second source or split record) are "disputed". */
  maxUnconfirmedMovePct: number;
}

export function verificationConfig(): VerificationConfig {
  return {
    closeTolerancePct: num("CROSSCHECK_TOLERANCE_PCT", 0.1),
    closeToleranceAbs: num("CROSSCHECK_TOLERANCE_ABS", 0.011),
    intradayTolerancePct: num("INTRADAY_TOLERANCE_PCT", 0.5),
    maxQuoteAgeMinutes: num("MAX_QUOTE_AGE_MINUTES", 20),
    maxUnconfirmedMovePct: num("MAX_UNCONFIRMED_MOVE_PCT", 15),
  };
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** First date requested when backfilling (providers return from inception if later). */
export const BACKFILL_START = process.env.BACKFILL_START ?? "1993-01-01";
