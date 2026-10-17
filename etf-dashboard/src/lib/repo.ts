import type { RawBar } from "./analytics/calc";
import type { LatestPrice, ExpenseInfo } from "./analytics/metrics";
import type { Snapshot } from "./analytics/snapshot-types";
import type { VerificationConfig } from "./config";
import type { Db } from "./db";
import type { DailyBar } from "./providers/types";
import { validateDailyBar, type DataStatus, type Issue } from "./validation";

type Q = Pick<Db, "query">;

export interface StoredBar extends RawBar {
  verificationStatus: DataStatus;
  verificationSource: string | null;
  verificationClose: number | null;
  verificationDiffPct: number | null;
  verificationNote: string | null;
  source: string;
  retrievedAt: string;
}

export async function lastBarDates(db: Q): Promise<Map<string, string>> {
  const rows = await db.query<{ ticker: string; d: string }>(
    "SELECT ticker, max(session_date) AS d FROM daily_prices GROUP BY ticker",
  );
  return new Map(rows.map((r) => [r.ticker, r.d]));
}

export async function previousCloseBefore(db: Q, ticker: string, date: string): Promise<{ date: string; close: number } | null> {
  const rows = await db.query<{ session_date: string; close: number }>(
    "SELECT session_date, close FROM daily_prices WHERE ticker = $1 AND session_date < $2 ORDER BY session_date DESC LIMIT 1",
    [ticker, date],
  );
  return rows[0] ? { date: rows[0].session_date, close: rows[0].close } : null;
}

export interface UpsertResult {
  inserted: number;
  revisedVerified: string[];
  invalid: { date: string; issues: Issue[] }[];
}

/**
 * Upsert provider bars. Validates each bar; a verified close is never silently
 * replaced — if the primary source revises it, the row is flagged "disputed".
 */
export async function upsertDailyBars(
  db: Q,
  ticker: string,
  bars: DailyBar[],
  source: string,
  retrievedAt: string,
  cfg: VerificationConfig,
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, revisedVerified: [], invalid: [] };
  if (!bars.length) return result;
  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  const prior = await previousCloseBefore(db, ticker, sorted[0].date);

  const existing = await db.query<{ session_date: string; close: number; verification_status: string }>(
    `SELECT session_date, close, verification_status FROM daily_prices
     WHERE ticker = $1 AND session_date >= $2 AND verification_status = 'verified'`,
    [ticker, sorted[0].date],
  );
  const verified = new Map(existing.map((r) => [r.session_date, r.close]));

  const cols = {
    d: [] as string[], o: [] as (number | null)[], h: [] as (number | null)[], l: [] as (number | null)[],
    c: [] as number[], v: [] as (number | null)[], ao: [] as (number | null)[], ah: [] as (number | null)[],
    al: [] as (number | null)[], ac: [] as (number | null)[], dc: [] as number[], sf: [] as number[],
    st: [] as string[], note: [] as (string | null)[],
  };
  let prevClose = prior?.close ?? null;
  for (const b of sorted) {
    const old = verified.get(b.date);
    if (old !== undefined && Math.abs(old - b.close) > Math.max(cfg.closeToleranceAbs, (old * cfg.closeTolerancePct) / 100)) {
      result.revisedVerified.push(b.date);
      await db.query(
        `UPDATE daily_prices SET verification_status = 'disputed',
           verification_note = $3, verification_checked_at = now()
         WHERE ticker = $1 AND session_date = $2`,
        [ticker, b.date, `${source} revised the close from ${old} to ${b.close} after verification; review required.`],
      );
      prevClose = b.close;
      continue;
    }
    const issues = validateDailyBar(b, prevClose, cfg);
    const bad = issues.filter((i) => i.severity === "error");
    // A large unconfirmed move stays single-source here; the close-verification step decides.
    if (bad.length) result.invalid.push({ date: b.date, issues });
    // Unusable closes are never stored; other errors are stored but flagged "disputed".
    if (issues.some((i) => i.code === "invalid_close")) continue;
    cols.d.push(b.date); cols.o.push(b.open); cols.h.push(b.high); cols.l.push(b.low); cols.c.push(b.close);
    cols.v.push(b.volume); cols.ao.push(b.adjOpen); cols.ah.push(b.adjHigh); cols.al.push(b.adjLow);
    cols.ac.push(b.adjClose); cols.dc.push(b.divCash); cols.sf.push(b.splitFactor);
    cols.st.push(bad.length ? "disputed" : "single_source");
    cols.note.push(bad.length ? bad.map((i) => i.message).join(" ") : null);
    if (Number.isFinite(b.close) && b.close > 0) prevClose = b.close;
  }

  const CHUNK = 2000;
  for (let i = 0; i < cols.d.length; i += CHUNK) {
    const s = (a: unknown[]) => a.slice(i, i + CHUNK);
    await db.query(
      `INSERT INTO daily_prices (ticker, session_date, open, high, low, close, volume, adj_open, adj_high, adj_low,
         adj_close, div_cash, split_factor, source, retrieved_at, verification_status, verification_note)
       SELECT $1, t.d::date, t.o, t.h, t.l, t.c, t.v, t.ao, t.ah, t.al, t.ac, t.dc, t.sf, $2, $3::timestamptz, t.st, t.note
       FROM unnest($4::text[], $5::float8[], $6::float8[], $7::float8[], $8::float8[], $9::float8[], $10::float8[],
                   $11::float8[], $12::float8[], $13::float8[], $14::float8[], $15::float8[], $16::text[], $17::text[])
         AS t(d, o, h, l, c, v, ao, ah, al, ac, dc, sf, st, note)
       ON CONFLICT (ticker, session_date) DO UPDATE SET
         open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, volume = EXCLUDED.volume,
         adj_open = EXCLUDED.adj_open, adj_high = EXCLUDED.adj_high, adj_low = EXCLUDED.adj_low,
         adj_close = EXCLUDED.adj_close, div_cash = EXCLUDED.div_cash, split_factor = EXCLUDED.split_factor,
         retrieved_at = EXCLUDED.retrieved_at, source = EXCLUDED.source,
         verification_status = CASE
           WHEN daily_prices.close = EXCLUDED.close AND EXCLUDED.verification_status <> 'disputed'
             THEN daily_prices.verification_status
           ELSE EXCLUDED.verification_status END,
         verification_note = CASE
           WHEN daily_prices.close = EXCLUDED.close AND EXCLUDED.verification_status <> 'disputed'
             THEN daily_prices.verification_note
           ELSE EXCLUDED.verification_note END,
         verification_source = CASE WHEN daily_prices.close = EXCLUDED.close THEN daily_prices.verification_source ELSE NULL END,
         verification_close = CASE WHEN daily_prices.close = EXCLUDED.close THEN daily_prices.verification_close ELSE NULL END,
         verification_diff_pct = CASE WHEN daily_prices.close = EXCLUDED.close THEN daily_prices.verification_diff_pct ELSE NULL END,
         close = EXCLUDED.close`,
      [ticker, source, retrievedAt, s(cols.d), s(cols.o), s(cols.h), s(cols.l), s(cols.c), s(cols.v), s(cols.ao),
        s(cols.ah), s(cols.al), s(cols.ac), s(cols.dc), s(cols.sf), s(cols.st), s(cols.note)],
    );
  }
  result.inserted = cols.d.length;
  return result;
}

export async function setBarVerification(
  db: Q,
  ticker: string,
  date: string,
  v: { status: DataStatus; source: string | null; value: number | null; diffPct: number | null; note: string | null },
): Promise<void> {
  await db.query(
    `UPDATE daily_prices SET verification_status = $3, verification_source = $4, verification_close = $5,
       verification_diff_pct = $6, verification_note = $7, verification_checked_at = now()
     WHERE ticker = $1 AND session_date = $2`,
    [ticker, date, v.status, v.source, v.value, v.diffPct, v.note],
  );
}

interface BarRow {
  ticker: string;
  session_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  adj_close: number | null;
  split_factor: number;
  source: string;
  retrieved_at: string;
  verification_status: DataStatus;
  verification_source: string | null;
  verification_close: number | null;
  verification_diff_pct: number | null;
  verification_note: string | null;
}

const toStored = (r: BarRow): StoredBar => ({
  date: r.session_date,
  open: r.open,
  high: r.high,
  low: r.low,
  close: r.close,
  volume: r.volume,
  adjClose: r.adj_close,
  splitFactor: r.split_factor,
  source: r.source,
  retrievedAt: r.retrieved_at,
  verificationStatus: r.verification_status,
  verificationSource: r.verification_source,
  verificationClose: r.verification_close,
  verificationDiffPct: r.verification_diff_pct,
  verificationNote: r.verification_note,
});

export async function loadBars(db: Q, tickers: string[], through?: string): Promise<Map<string, StoredBar[]>> {
  const rows = await db.query<BarRow>(
    `SELECT ticker, session_date, open, high, low, close, volume, adj_close, split_factor, source, retrieved_at,
            verification_status, verification_source, verification_close, verification_diff_pct, verification_note
     FROM daily_prices WHERE ticker = ANY($1::text[]) ${through ? "AND session_date <= $2" : ""}
     ORDER BY ticker, session_date`,
    through ? [tickers, through] : [tickers],
  );
  const out = new Map<string, StoredBar[]>(tickers.map((t) => [t, []]));
  for (const r of rows) out.get(r.ticker)!.push(toStored(r));
  return out;
}

export interface ObservationInput {
  ticker: string;
  sessionDate: string;
  slot: string;
  kind: "intraday" | "close";
  price: number | null;
  priceField: string | null;
  prevClose: number | null;
  prevCloseDate: string | null;
  source: string;
  quoteTimestamp: string | null;
  retrievedAt: string;
  isDelayed: boolean;
  status: DataStatus;
  secondarySource: string | null;
  secondaryPrice: number | null;
  discrepancyPct: number | null;
  issues: Issue[];
  jobRunId: number | null;
}

export async function insertObservation(db: Q, o: ObservationInput): Promise<boolean> {
  const rows = await db.query<{ inserted: boolean }>(
    `INSERT INTO price_observations (ticker, session_date, slot, kind, price, price_field, prev_close, prev_close_date,
       source, quote_timestamp, retrieved_at, is_delayed, verification_status, secondary_source, secondary_price,
       discrepancy_pct, issues, job_run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)
     ON CONFLICT (ticker, kind, source, session_date, quote_timestamp) DO UPDATE SET
       verification_status = EXCLUDED.verification_status, secondary_source = EXCLUDED.secondary_source,
       secondary_price = EXCLUDED.secondary_price, discrepancy_pct = EXCLUDED.discrepancy_pct, issues = EXCLUDED.issues
     RETURNING (xmax = 0) AS inserted`,
    [o.ticker, o.sessionDate, o.slot, o.kind, o.price, o.priceField, o.prevClose, o.prevCloseDate, o.source,
      o.quoteTimestamp, o.retrievedAt, o.isDelayed, o.status, o.secondarySource, o.secondaryPrice, o.discrepancyPct,
      JSON.stringify(o.issues), o.jobRunId],
  );
  /** True when a new row was inserted, false when an existing observation was updated. */
  return rows[0]?.inserted === true;
}

interface ObsRow {
  ticker: string;
  session_date: string;
  slot: string;
  kind: "intraday" | "close";
  price: number;
  price_field: string | null;
  source: string;
  quote_timestamp: string | null;
  retrieved_at: string;
  is_delayed: boolean;
  verification_status: DataStatus;
  secondary_source: string | null;
  secondary_price: number | null;
  discrepancy_pct: number | null;
  issues: Issue[];
}

/**
 * Newest observation per ticker: latest session first, official close beats
 * intraday, then newest quote timestamp. Older data can never displace newer data.
 */
export async function latestObservations(db: Q, through?: string): Promise<Map<string, LatestPrice>> {
  const rows = await db.query<ObsRow>(
    `SELECT DISTINCT ON (ticker) ticker, session_date, slot, kind, price, price_field, source, quote_timestamp,
       retrieved_at, is_delayed, verification_status, secondary_source, secondary_price, discrepancy_pct, issues
     FROM price_observations
     WHERE price IS NOT NULL ${through ? "AND session_date <= $1" : ""}
     ORDER BY ticker, session_date DESC, (kind = 'close') DESC, quote_timestamp DESC NULLS LAST, retrieved_at DESC`,
    through ? [through] : [],
  );
  return new Map(rows.map((r) => [r.ticker, obsToLatest(r)]));
}

function obsToLatest(r: ObsRow): LatestPrice {
  return {
    price: r.price,
    kind: r.kind,
    sessionDate: r.session_date,
    slot: r.slot,
    source: r.source,
    priceField: r.price_field,
    quoteTimestamp: r.quote_timestamp,
    retrievedAt: r.retrieved_at,
    isDelayed: r.is_delayed,
    status: r.verification_status,
    issues: r.issues ?? [],
    secondarySource: r.secondary_source,
    secondaryPrice: r.secondary_price,
    discrepancyPct: r.discrepancy_pct,
  };
}

export async function observationsForTicker(db: Q, ticker: string, sinceDate: string) {
  const rows = await db.query<ObsRow>(
    `SELECT ticker, session_date, slot, kind, price, price_field, source, quote_timestamp, retrieved_at, is_delayed,
       verification_status, secondary_source, secondary_price, discrepancy_pct, issues
     FROM price_observations WHERE ticker = $1 AND session_date >= $2 AND price IS NOT NULL
     ORDER BY quote_timestamp`,
    [ticker, sinceDate],
  );
  return rows.map(obsToLatest);
}

export async function expenseInfo(db: Q): Promise<Map<string, ExpenseInfo>> {
  const rows = await db.query<{
    ticker: string; expense_ratio: number; expense_ratio_status: string; expense_ratio_source: string | null; expense_ratio_verified_at: string | null;
  }>("SELECT ticker, expense_ratio, expense_ratio_status, expense_ratio_source, expense_ratio_verified_at FROM etfs");
  return new Map(
    rows.map((r) => [
      r.ticker,
      {
        ratio: r.expense_ratio,
        status: r.expense_ratio_status === "verified" ? "verified" : "reference",
        source: r.expense_ratio_source,
        verifiedAt: r.expense_ratio_verified_at,
      },
    ]),
  );
}

export async function setExpenseRatio(db: Q, ticker: string, ratio: number, source: string, verifiedAt: string | null, note?: string) {
  const status = verifiedAt ? "verified" : "reference";
  await db.query(
    `UPDATE etfs SET expense_ratio = $2, expense_ratio_status = $3, expense_ratio_source = $4,
       expense_ratio_verified_at = $5, updated_at = now() WHERE ticker = $1`,
    [ticker, ratio, status, source, verifiedAt],
  );
  await db.query(
    "INSERT INTO expense_ratio_history (ticker, expense_ratio, status, source, note) VALUES ($1, $2, $3, $4, $5)",
    [ticker, ratio, status, source, note ?? null],
  );
}

// ---- Job runs ----

export async function startJob(db: Q, jobType: string, slot: string | null, sessionDate: string | null, trigger: string): Promise<number> {
  const rows = await db.query<{ id: number }>(
    "INSERT INTO job_runs (job_type, slot, session_date, trigger, status) VALUES ($1, $2, $3, $4, 'running') RETURNING id",
    [jobType, slot, sessionDate, trigger],
  );
  return rows[0].id;
}

export async function finishJob(db: Q, id: number, status: string, message: string, details: unknown): Promise<void> {
  await db.query("UPDATE job_runs SET status = $2, message = $3, details = $4::jsonb, finished_at = now() WHERE id = $1", [
    id,
    status,
    message,
    JSON.stringify(details ?? {}),
  ]);
}

export async function logSkippedJob(db: Q, jobType: string, sessionDate: string | null, trigger: string, message: string) {
  await db.query(
    `INSERT INTO job_runs (job_type, slot, session_date, trigger, status, message, finished_at)
     VALUES ($1, NULL, $2, $3, 'skipped', $4, now())`,
    [jobType, sessionDate, trigger, message],
  );
}

export async function hasCompletedRun(db: Q, sessionDate: string, slot: string): Promise<boolean> {
  const rows = await db.query(
    "SELECT 1 FROM job_runs WHERE job_type = 'update' AND session_date = $1 AND slot = $2 AND status = 'success' LIMIT 1",
    [sessionDate, slot],
  );
  return rows.length > 0;
}

export interface JobRunRow {
  id: number;
  job_type: string;
  slot: string | null;
  session_date: string | null;
  trigger: string;
  status: string;
  message: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function recentJobs(db: Q, limit = 20): Promise<JobRunRow[]> {
  return db.query<JobRunRow>(
    `SELECT id, job_type, slot, session_date, trigger, status, message, started_at, finished_at
     FROM job_runs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
}

export async function lastSuccessfulUpdate(db: Q): Promise<JobRunRow | null> {
  const rows = await db.query<JobRunRow>(
    `SELECT id, job_type, slot, session_date, trigger, status, message, started_at, finished_at FROM job_runs
     WHERE job_type = 'update' AND status IN ('success', 'partial') ORDER BY finished_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

// ---- Snapshots ----

export async function saveSnapshot(db: Q, s: Snapshot, jobRunId: number | null): Promise<void> {
  await db.query(
    `INSERT INTO metrics_snapshots (session_date, slot, computed_at, job_run_id, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (session_date, slot) DO UPDATE SET computed_at = EXCLUDED.computed_at,
       job_run_id = EXCLUDED.job_run_id, data = EXCLUDED.data`,
    [s.sessionDate, s.slot, s.computedAt, jobRunId, JSON.stringify(s)],
  );
}

export async function latestSnapshot(db: Q): Promise<Snapshot | null> {
  const rows = await db.query<{ data: Snapshot }>(
    "SELECT data FROM metrics_snapshots ORDER BY session_date DESC, computed_at DESC LIMIT 1",
  );
  return rows[0]?.data ?? null;
}

export async function previousSessionSnapshot(db: Q, beforeSession: string): Promise<Snapshot | null> {
  const rows = await db.query<{ data: Snapshot }>(
    `SELECT data FROM metrics_snapshots WHERE session_date < $1
     ORDER BY session_date DESC, (slot = 'evening') DESC, computed_at DESC LIMIT 1`,
    [beforeSession],
  );
  return rows[0]?.data ?? null;
}
