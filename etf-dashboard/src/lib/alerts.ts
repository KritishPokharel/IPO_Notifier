import type { EtfMetrics } from "./analytics/metrics";
import { breachesDailyDrop, round } from "./analytics/calc";
import { appUrl } from "./config";
import type { Db } from "./db";
import { deliver, escapeHtml, type EmailMessage, type EmailTransport } from "./email";
import { formatEt } from "./market/time";
import type { AlertSettings } from "./settings";
import { STATUS_LABELS, type DataStatus } from "./validation";

type Q = Pick<Db, "query">;

export interface AlertEvent {
  id: number;
  ticker: string;
  session_date: string;
  alert_type: string;
  trigger_kind: string;
  slot: string;
  threshold: number;
  prev_close: number | null;
  price: number;
  change_abs: number | null;
  change_pct: number | null;
  high_52w: number | null;
  pct_below_high: number | null;
  observation_ts: string | null;
  verification_status: DataStatus;
  email_status: string;
  created_at: string;
}

export function alertEligible(status: DataStatus, settings: AlertSettings): boolean {
  return status === "verified" || (status === "single_source" && settings.allowSingleSource);
}

interface Candidate {
  etf: EtfMetrics;
  alertType: string;
  threshold: number;
}

export interface TargetAlert {
  id: number;
  ticker: string;
  direction: "below" | "above";
  target_price: number;
  enabled: boolean;
}

export function findCandidates(etfs: EtfMetrics[], sessionDate: string, settings: AlertSettings, targets: TargetAlert[]): Candidate[] {
  const out: Candidate[] = [];
  for (const e of etfs) {
    if (!e.latest || e.price === null || e.latest.sessionDate !== sessionDate) continue;
    if (!alertEligible(e.status, settings)) continue;
    if (settings.tickers.includes(e.ticker) && e.dailyChangePct !== null && breachesDailyDrop(e.dailyChangePct, settings.thresholdPct)) {
      out.push({ etf: e, alertType: "daily_drop", threshold: settings.thresholdPct });
    }
    for (const t of targets) {
      if (!t.enabled || t.ticker !== e.ticker) continue;
      const hit = t.direction === "below" ? e.price <= t.target_price : e.price >= t.target_price;
      if (hit) out.push({ etf: e, alertType: `target:${t.id}:${t.direction}`, threshold: t.target_price });
    }
  }
  return out;
}

export interface AlertRunResult {
  created: AlertEvent[];
  emailed: number;
  emailError: string | null;
}

/**
 * Record qualifying alerts (one per ETF, alert type and session — enforced by a
 * unique constraint) and send one combined email for new or previously-failed alerts.
 */
export async function processAlerts(
  db: Q,
  etfs: EtfMetrics[],
  ctx: { sessionDate: string; slot: string; jobRunId: number | null; settings: AlertSettings; transport: EmailTransport | null },
): Promise<AlertRunResult> {
  const targets = await db.query<TargetAlert>("SELECT id, ticker, direction, target_price, enabled FROM target_price_alerts");
  const candidates = findCandidates(etfs, ctx.sessionDate, ctx.settings, targets);
  const created: AlertEvent[] = [];
  for (const c of candidates) {
    const e = c.etf;
    const rows = await db.query<AlertEvent>(
      `INSERT INTO alert_events (ticker, session_date, alert_type, trigger_kind, slot, threshold, prev_close, price,
         change_abs, change_pct, high_52w, pct_below_high, observation_ts, verification_status, email_status, job_run_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (ticker, session_date, alert_type) DO NOTHING
       RETURNING *`,
      [e.ticker, ctx.sessionDate, c.alertType, e.latest!.kind === "close" ? "close" : "intraday", ctx.slot, c.threshold,
        e.prevClose, e.price, e.dailyChange, e.dailyChangePct, e.high52w?.value ?? null, e.pctFromHigh52w,
        e.latest!.quoteTimestamp ?? e.latest!.retrievedAt, e.status, ctx.settings.enabled ? "pending" : "disabled", ctx.jobRunId],
    );
    created.push(...rows);
  }

  if (!ctx.settings.enabled) return { created, emailed: 0, emailError: null };
  const toSend = await db.query<AlertEvent>(
    "SELECT * FROM alert_events WHERE session_date = $1 AND email_status IN ('pending', 'failed') ORDER BY change_pct ASC NULLS LAST",
    [ctx.sessionDate],
  );
  if (!toSend.length) return { created, emailed: 0, emailError: null };
  if (!ctx.settings.recipient) {
    await db.query("UPDATE alert_events SET email_status = 'failed' WHERE id = ANY($1::bigint[])", [toSend.map((a) => a.id)]);
    return { created, emailed: 0, emailError: "No alert recipient configured." };
  }
  const byTicker = new Map(etfs.map((e) => [e.ticker, e]));
  const msg = buildAlertEmail(toSend, byTicker, ctx.settings.recipient);
  msg.idempotencyKey = `etf-alert-${ctx.sessionDate}-${toSend.map((a) => a.id).join("-")}`;
  const res = await deliver(db, ctx.transport, msg, "alert");
  await db.query("UPDATE alert_events SET email_status = $2, email_delivery_id = $3 WHERE id = ANY($1::bigint[])", [
    toSend.map((a) => a.id),
    res.ok ? "sent" : "failed",
    res.deliveryId,
  ]);
  return { created, emailed: res.ok ? toSend.length : 0, emailError: res.error };
}

const money = (v: number | null) => (v === null ? "n/a" : `$${v.toFixed(2)}`);
const pctS = (v: number | null, dp = 2) => (v === null ? "n/a" : `${v.toFixed(dp)}%`);

function describe(a: AlertEvent): string {
  if (a.alert_type === "daily_drop") return `${a.ticker} Down ${Math.abs(round(a.change_pct ?? 0, 1)!).toFixed(1)}%`;
  const [, , dir] = a.alert_type.split(":");
  return `${a.ticker} ${dir === "below" ? "at/below" : "at/above"} target ${money(a.threshold)}`;
}

export function buildAlertEmail(alerts: AlertEvent[], byTicker: Map<string, EtfMetrics>, to: string): EmailMessage {
  const drops = alerts.filter((a) => a.alert_type === "daily_drop");
  const subject =
    alerts.length === 1
      ? `ETF Alert: ${describe(alerts[0])}${alerts[0].alert_type === "daily_drop" ? " Today" : ""}`
      : drops.length === alerts.length
        ? `ETF Alert: ${alerts.map(describe).join(", ")} Today`
        : `ETF Alert: ${alerts.length} alerts (${alerts.map((a) => a.ticker).join(", ")})`;
  const url = appUrl();
  const rowsText: string[] = [];
  const rowsHtml: string[] = [];
  for (const a of alerts) {
    const e = byTicker.get(a.ticker);
    const fields: [string, string][] = [
      ["ETF", a.ticker],
      ["Category", e?.category ?? ""],
      ["Alert", a.alert_type === "daily_drop" ? `Daily decline greater than ${a.threshold}%` : describe(a)],
      ["Previous trading day close", money(a.prev_close)],
      ["Latest verified price", money(a.price)],
      ["Dollar change", money(a.change_abs)],
      ["Percentage change", pctS(a.change_pct)],
      ["52-week high", money(a.high_52w)],
      ["Below 52-week high", pctS(a.pct_below_high === null ? null : -a.pct_below_high)],
      ["Price observation time", formatEt(a.observation_ts)],
      ["Triggered", a.trigger_kind === "close" ? "At the official close" : `Intraday (${a.slot} update)`],
      ["Verification status", STATUS_LABELS[a.verification_status] ?? a.verification_status],
      ["Dashboard", `${url}/etf/${a.ticker}`],
    ];
    rowsText.push(fields.map(([k, v]) => `${k}: ${v}`).join("\n"));
    rowsHtml.push(
      `<table style="border-collapse:collapse;margin:0 0 20px;font-family:system-ui,sans-serif;font-size:14px">` +
        fields
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600">${
                k === "Dashboard" ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v)
              }</td></tr>`,
          )
          .join("") +
        `</table>`,
    );
  }
  const footer =
    "This alert was generated from validated market data at a scheduled update. It is informational only and not investment advice.";
  return {
    to,
    subject,
    text: `${rowsText.join("\n\n")}\n\n${footer}\n${url}`,
    html: `<div><h2 style="font-family:system-ui,sans-serif">${escapeHtml(subject)}</h2>${rowsHtml.join("")}<p style="color:#777;font-size:12px;font-family:system-ui,sans-serif">${escapeHtml(footer)}</p></div>`,
  };
}

export async function recentAlerts(db: Q, limit = 50) {
  return db.query<AlertEvent & { delivery_status: string | null; delivery_error: string | null }>(
    `SELECT a.*, d.status AS delivery_status, d.error AS delivery_error FROM alert_events a
     LEFT JOIN email_deliveries d ON d.id = a.email_delivery_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit],
  );
}

export async function alertsForSession(db: Q, sessionDate: string): Promise<AlertEvent[]> {
  return db.query<AlertEvent>("SELECT * FROM alert_events WHERE session_date = $1", [sessionDate]);
}
