import { z } from "zod";
import type { Db } from "./db";
import { TICKERS } from "./etfs";

export const alertSettingsSchema = z.object({
  enabled: z.boolean(),
  thresholdPct: z.number().gt(0).lt(100),
  tickers: z.array(z.enum(TICKERS as [string, ...string[]])),
  recipient: z.string().email().nullable(),
  /** Allow alerts from data that passed validation but has no independent cross-check. */
  allowSingleSource: z.boolean(),
});
export type AlertSettings = z.infer<typeof alertSettingsSchema>;

export const watchlistSettingsSchema = z.object({
  drawdownLevels: z.array(z.number().gt(0).lt(100)).min(1).max(5),
  near90dLowPct: z.number().min(0).max(50),
  near52wLowPct: z.number().min(0).max(50),
  unusualSigma: z.number().gt(0).max(10),
});
export type WatchlistSettings = z.infer<typeof watchlistSettingsSchema>;

export function defaultAlertSettings(): AlertSettings {
  const recipient = process.env.ALERT_EMAIL_TO?.trim() || null;
  return {
    enabled: true,
    thresholdPct: 5,
    tickers: [...TICKERS],
    recipient: recipient && z.string().email().safeParse(recipient).success ? recipient : null,
    allowSingleSource: true,
  };
}

export const DEFAULT_WATCHLIST_SETTINGS: WatchlistSettings = {
  drawdownLevels: [10, 15, 20],
  near90dLowPct: 3,
  near52wLowPct: 5,
  unusualSigma: 2.5,
};

async function getSetting<T>(db: Pick<Db, "query">, key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const rows = await db.query<{ value: unknown }>("SELECT value FROM settings WHERE key = $1", [key]);
  if (!rows.length) return fallback;
  const parsed = schema.safeParse({ ...(fallback as object), ...(rows[0].value as object) });
  return parsed.success ? parsed.data : fallback;
}

async function setSetting(db: Pick<Db, "query">, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getAlertSettings(db: Pick<Db, "query">): Promise<AlertSettings> {
  const s = await getSetting(db, "alerts", alertSettingsSchema, defaultAlertSettings());
  if (!s.recipient) s.recipient = defaultAlertSettings().recipient;
  return s;
}

export async function saveAlertSettings(db: Pick<Db, "query">, s: AlertSettings): Promise<AlertSettings> {
  const parsed = alertSettingsSchema.parse(s);
  await setSetting(db, "alerts", parsed);
  return parsed;
}

export async function getWatchlistSettings(db: Pick<Db, "query">): Promise<WatchlistSettings> {
  return getSetting(db, "watchlist", watchlistSettingsSchema, DEFAULT_WATCHLIST_SETTINGS);
}

export async function saveWatchlistSettings(db: Pick<Db, "query">, s: WatchlistSettings): Promise<WatchlistSettings> {
  const parsed = watchlistSettingsSchema.parse({
    ...s,
    drawdownLevels: [...s.drawdownLevels].sort((a, b) => a - b),
  });
  await setSetting(db, "watchlist", parsed);
  return parsed;
}
