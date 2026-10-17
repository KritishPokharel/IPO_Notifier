import { processAlerts, type AlertRunResult } from "../alerts";
import { buildSnapshot } from "../analytics/snapshot";
import { BACKFILL_START, verificationConfig, type VerificationConfig } from "../config";
import type { Db } from "../db";
import type { EmailTransport } from "../email";
import { TICKERS } from "../etfs";
import { marketStatus, previousTradingDay, sessionCloseMinutes, isTradingDay } from "../market/calendar";
import { resolveSlot, isRegularSession, type Slot } from "../market/schedule";
import { addDays, etWallToUtc } from "../market/time";
import type { ProviderSet } from "../providers";
import {
  finishJob,
  hasCompletedRun,
  insertObservation,
  lastBarDates,
  loadBars,
  logSkippedJob,
  saveSnapshot,
  setBarVerification,
  startJob,
  upsertDailyBars,
} from "../repo";
import { getAlertSettings } from "../settings";
import { crossCheck, decideStatus, detectSplitDiscontinuity, selectQuote, validateDailyBar, type DataStatus, type Issue } from "../validation";

export type Trigger = "scheduled" | "manual" | "cli";

export interface UpdateOptions {
  db: Db;
  providers: ProviderSet;
  transport: EmailTransport | null;
  trigger: Trigger;
  now?: Date;
  /** Force a specific slot/session (CLI recovery). Otherwise resolved from the clock. */
  slot?: Slot;
  sessionDate?: string;
  force?: boolean;
  tickers?: string[];
  log?: (msg: string) => void;
  cfg?: VerificationConfig;
}

export interface UpdateResult {
  status: "success" | "partial" | "failed" | "skipped";
  message: string;
  jobRunId: number | null;
  slot: string | null;
  sessionDate: string | null;
  mode?: "intraday" | "close";
  tickers?: Record<string, { status: DataStatus | "missing"; price: number | null; note?: string }>;
  alerts?: AlertRunResult;
  errors?: string[];
}

interface Plan {
  slot: string;
  sessionDate: string;
  mode: "intraday" | "close";
}

function plan(opts: UpdateOptions, now: Date): Plan | { skip: string; sessionDate: string } {
  if (opts.slot) {
    const sessionDate = opts.sessionDate ?? resolveSlot(now).sessionDate;
    if (!isTradingDay(sessionDate)) return { skip: `${sessionDate} is not a trading day`, sessionDate };
    return { slot: opts.slot, sessionDate, mode: opts.slot === "evening" ? "close" : "intraday" };
  }
  if (opts.trigger === "manual") {
    const ms = marketStatus(now);
    if (isRegularSession(now)) return { slot: "manual", sessionDate: ms.etDate, mode: "intraday" };
    return { slot: "manual", sessionDate: ms.lastCompletedSession, mode: "close" };
  }
  const r = resolveSlot(now);
  if (!r.slot) return { skip: r.reason, sessionDate: r.sessionDate };
  return { slot: r.slot, sessionDate: r.sessionDate, mode: r.slot === "evening" ? "close" : "intraday" };
}

/**
 * Run one data update: sync history, fetch & validate prices, cross-check,
 * persist observations, recompute the analytics snapshot and evaluate alerts.
 */
export async function runUpdate(opts: UpdateOptions): Promise<UpdateResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((m: string) => console.log(`[update] ${m}`));
  const cfg = opts.cfg ?? verificationConfig();
  const db = opts.db;
  const tickers = opts.tickers ?? TICKERS;
  const p = plan(opts, now);
  if ("skip" in p) {
    log(`Skipped: ${p.skip}`);
    if (opts.trigger !== "manual") await logSkippedJob(db, "update", p.sessionDate, opts.trigger, p.skip);
    return { status: "skipped", message: p.skip, jobRunId: null, slot: null, sessionDate: p.sessionDate };
  }
  if (p.slot !== "manual" && !opts.force && (await hasCompletedRun(db, p.sessionDate, p.slot))) {
    const msg = `The ${p.slot} update for ${p.sessionDate} already completed successfully`;
    log(`Skipped: ${msg}`);
    return { status: "skipped", message: msg, jobRunId: null, slot: p.slot, sessionDate: p.sessionDate };
  }

  const jobId = await startJob(db, "update", p.slot, p.sessionDate, opts.trigger);
  const errors: string[] = [];
  const results: NonNullable<UpdateResult["tickers"]> = {};
  try {
    const primary = opts.providers.primary;
    if (!primary) throw new Error("Primary data provider is not configured (TIINGO_API_KEY missing).");
    log(`Job ${jobId}: ${p.slot} update for ${p.sessionDate} (${p.mode})`);

    // 1. Incremental history sync (backfills on first run).
    const prevSession = previousTradingDay(p.sessionDate);
    const lastDates = await lastBarDates(db);
    const retrievedAt = now.toISOString();
    for (const t of tickers) {
      const last = lastDates.get(t);
      const needed = p.mode === "close" ? p.sessionDate : prevSession;
      if (last && last >= needed) continue;
      const start = last ? addDays(last, -7) : BACKFILL_START;
      try {
        const bars = (await primary.getDailyHistory(t, start)).filter((b) => b.date <= p.sessionDate);
        const res = await upsertDailyBars(db, t, bars, primary.name, retrievedAt, cfg);
        log(`${t}: synced ${res.inserted} daily bars from ${start}`);
        if (res.revisedVerified.length) errors.push(`${t}: primary source revised verified closes on ${res.revisedVerified.join(", ")}`);
      } catch (e) {
        errors.push(`${t}: history sync failed — ${(e as Error).message}`);
      }
    }
    const bars = await loadBars(db, tickers, p.sessionDate);

    if (p.mode === "intraday") {
      // 2a. Intraday quotes.
      const quotes = new Map((await primary.getQuotes(tickers)).map((q) => [q.ticker, q]));
      const secondary = new Map<string, number | null>();
      if (opts.providers.secondaryQuote && opts.trigger !== "manual") {
        try {
          for (const q of await opts.providers.secondaryQuote.getQuotes(tickers)) {
            const sel = selectQuote(q, p.sessionDate, now, cfg);
            secondary.set(q.ticker, sel.issues.some((i) => i.severity !== "info") ? null : (sel.candidate?.price ?? null));
          }
        } catch (e) {
          errors.push(`Secondary quote check failed — ${(e as Error).message}`);
        }
      }
      for (const t of tickers) {
        const q = quotes.get(t);
        const tb = bars.get(t) ?? [];
        const prevBar = [...tb].reverse().find((b) => b.date < p.sessionDate) ?? null;
        if (!q) {
          results[t] = { status: "missing", price: null, note: "No quote returned" };
          continue;
        }
        const sel = selectQuote(q, p.sessionDate, now, cfg);
        const issues: Issue[] = [...sel.issues];
        const price = sel.candidate?.price ?? null;
        if (!prevBar || prevBar.date !== prevSession) {
          issues.push({ code: "missing_prev_close", severity: "warning", message: `Previous session (${prevSession}) close not stored yet.` });
        }
        if (prevBar && q.prevClose !== null) {
          const pc = crossCheck(prevBar.close, q.prevClose, q.source, cfg.closeTolerancePct, cfg.closeToleranceAbs);
          if (pc.outcome === "disagree") {
            issues.push({
              code: "prev_close_mismatch",
              severity: Math.abs(pc.diffPct ?? 0) > 2 ? "error" : "warning",
              message: `Quote feed previous close ${q.prevClose} differs from stored close ${prevBar.close} (${pc.diffPct?.toFixed(3)}%).`,
            });
          }
        }
        if (price !== null && prevBar) {
          const s = detectSplitDiscontinuity(prevBar.close, price, 1, cfg.maxUnconfirmedMovePct);
          if (s) issues.push(s);
        }
        const check = price !== null && opts.providers.secondaryQuote && opts.trigger !== "manual"
          ? crossCheck(price, secondary.get(t), opts.providers.secondaryQuote.name, cfg.intradayTolerancePct)
          : null;
        let status = price === null ? "disputed" : decideStatus(issues, check);
        if (status !== "disputed" && issues.some((i) => i.code === "missing_prev_close")) status = "pending";
        await insertObservation(db, {
          ticker: t,
          sessionDate: p.sessionDate,
          slot: p.slot,
          kind: "intraday",
          price,
          priceField: sel.candidate?.field ?? null,
          prevClose: prevBar?.close ?? null,
          prevCloseDate: prevBar?.date ?? null,
          source: q.source,
          quoteTimestamp: sel.candidate?.timestamp ?? null,
          retrievedAt,
          isDelayed: q.isDelayed,
          status,
          secondarySource: check?.source ?? null,
          secondaryPrice: check?.value ?? null,
          discrepancyPct: check?.diffPct ?? null,
          issues,
          jobRunId: jobId,
        });
        results[t] = { status, price, note: issues.find((i) => i.severity !== "info")?.message };
      }
    } else {
      // 2b. Official completed-session closes, cross-checked against a second source.
      let secondary = new Map<string, number>();
      const sc = opts.providers.secondaryClose;
      if (sc) {
        try {
          secondary = await sc.getCloses(tickers, p.sessionDate);
          log(`Cross-check: ${sc.name} returned ${secondary.size} closes for ${p.sessionDate}`);
        } catch (e) {
          errors.push(`Secondary close check failed — ${(e as Error).message}`);
        }
      }
      const closeMin = sessionCloseMinutes(p.sessionDate);
      const closeTs = etWallToUtc(p.sessionDate, Math.floor(closeMin / 60), closeMin % 60).toISOString();
      for (const t of tickers) {
        const tb = bars.get(t) ?? [];
        const bar = tb.find((b) => b.date === p.sessionDate);
        const prevBar = [...tb].reverse().find((b) => b.date < p.sessionDate) ?? null;
        if (!bar) {
          results[t] = { status: "missing", price: null, note: "Official close not yet available; will retry" };
          continue;
        }
        const issues = validateDailyBar(
          { ...bar, adjOpen: null, adjHigh: null, adjLow: null, divCash: 0 },
          prevBar?.close ?? null,
          cfg,
        );
        if (bar.verificationStatus === "disputed" && bar.verificationNote?.includes("revised")) {
          issues.push({ code: "revised_after_verification", severity: "error", message: bar.verificationNote });
        }
        const check = sc ? crossCheck(bar.close, secondary.get(t), sc.name, cfg.closeTolerancePct, cfg.closeToleranceAbs) : null;
        const status = decideStatus(issues, check);
        const note =
          check?.outcome === "disagree"
            ? `${sc!.name} close ${check.value} differs from ${bar.source} close ${bar.close} by ${check.diffPct!.toFixed(3)}% (tolerance ${cfg.closeTolerancePct}%). Needs investigation.`
            : (issues.find((i) => i.severity !== "info")?.message ?? (check?.outcome === "unavailable" ? `${sc!.name} close not available yet.` : null));
        await setBarVerification(db, t, p.sessionDate, {
          status,
          source: check?.source ?? null,
          value: check?.value ?? null,
          diffPct: check?.diffPct ?? null,
          note,
        });
        await insertObservation(db, {
          ticker: t,
          sessionDate: p.sessionDate,
          slot: p.slot,
          kind: "close",
          price: bar.close,
          priceField: "Official close",
          prevClose: prevBar?.close ?? null,
          prevCloseDate: prevBar?.date ?? null,
          source: bar.source,
          quoteTimestamp: closeTs,
          retrievedAt,
          isDelayed: false,
          status,
          secondarySource: check?.source ?? null,
          secondaryPrice: check?.value ?? null,
          discrepancyPct: check?.diffPct ?? null,
          issues: note && !issues.some((i) => i.message === note) ? [...issues, { code: "crosscheck", severity: status === "disputed" ? "error" : "info", message: note }] : issues,
          jobRunId: jobId,
        });
        results[t] = { status, price: bar.close, note: note ?? undefined };
      }
    }

    // 3. Analytics snapshot + alerts.
    const snapshot = await buildSnapshot(db, p.sessionDate, p.slot, now);
    await saveSnapshot(db, snapshot, jobId);
    const settings = await getAlertSettings(db);
    const alerts = await processAlerts(db, snapshot.etfs, {
      sessionDate: p.sessionDate,
      slot: p.slot,
      jobRunId: jobId,
      settings,
      transport: opts.transport,
    });
    if (alerts.emailError) errors.push(`Alert email: ${alerts.emailError}`);

    const good = Object.values(results).filter((r) => r.status === "verified" || r.status === "single_source").length;
    const status = good === tickers.length && !errors.length ? "success" : good > 0 ? "partial" : "failed";
    const message = `${good}/${tickers.length} ETFs validated; ${alerts.created.length} new alert(s)${errors.length ? `; ${errors.length} issue(s)` : ""}`;
    await finishJob(db, jobId, status, message, { mode: p.mode, tickers: results, errors, alerts: alerts.created.map((a) => a.ticker) });
    log(`${status}: ${message}`);
    for (const e of errors) log(`  ! ${e}`);
    return { status, message, jobRunId: jobId, slot: p.slot, sessionDate: p.sessionDate, mode: p.mode, tickers: results, alerts, errors };
  } catch (e) {
    const message = (e as Error).message;
    await finishJob(db, jobId, "failed", message, { tickers: results, errors });
    log(`failed: ${message}`);
    return { status: "failed", message, jobRunId: jobId, slot: p.slot, sessionDate: p.sessionDate, mode: p.mode, tickers: results, errors };
  }
}

/** Initial / repair backfill of full daily history for every ETF. */
export async function runBackfill(db: Db, providers: ProviderSet, opts: { start?: string; tickers?: string[]; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const primary = providers.primary;
  if (!primary) throw new Error("TIINGO_API_KEY missing");
  const jobId = await startJob(db, "backfill", null, null, "cli");
  const cfg = verificationConfig();
  const out: Record<string, { bars: number; first?: string; last?: string; invalid: number; error?: string }> = {};
  for (const t of opts.tickers ?? TICKERS) {
    try {
      const bars = await primary.getDailyHistory(t, opts.start ?? BACKFILL_START);
      const res = await upsertDailyBars(db, t, bars, primary.name, new Date().toISOString(), cfg);
      out[t] = { bars: res.inserted, first: bars[0]?.date, last: bars[bars.length - 1]?.date, invalid: res.invalid.length };
      log(`${t}: ${res.inserted} bars (${bars[0]?.date} → ${bars[bars.length - 1]?.date}), ${res.invalid.length} flagged`);
    } catch (e) {
      out[t] = { bars: 0, invalid: 0, error: (e as Error).message };
      log(`${t}: FAILED ${(e as Error).message}`);
    }
  }
  const failed = Object.values(out).filter((o) => o.error).length;
  await finishJob(db, jobId, failed ? (failed === Object.keys(out).length ? "failed" : "partial") : "success", `${Object.keys(out).length - failed} tickers backfilled`, out);
  return out;
}
