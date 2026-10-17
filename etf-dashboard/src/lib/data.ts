import "server-only";
import { buildSnapshot } from "./analytics/snapshot";
import type { Snapshot } from "./analytics/snapshot-types";
import { getDb } from "./db";
import { marketStatus, type MarketStatus } from "./market/calendar";
import { providersFromEnv } from "./providers";
import { lastBarDates, lastSuccessfulUpdate, latestSnapshot, type JobRunRow } from "./repo";

export interface DashboardData {
  snapshot: Snapshot | null;
  market: MarketStatus;
  lastUpdate: JobRunRow | null;
  missingConfig: string[];
  error: string | null;
}

/** Latest persisted snapshot; falls back to computing one from stored data if none exists yet. */
export async function getDashboardData(): Promise<DashboardData> {
  const market = marketStatus();
  const missingConfig = providersFromEnv().missing;
  try {
    const db = await getDb();
    let snapshot = await latestSnapshot(db);
    if (!snapshot) {
      const last = [...(await lastBarDates(db)).values()].sort().pop();
      if (last) snapshot = await buildSnapshot(db, last, "history");
    }
    return { snapshot, market, lastUpdate: await lastSuccessfulUpdate(db), missingConfig, error: null };
  } catch (e) {
    console.error("[dashboard] failed to load data", e);
    return { snapshot: null, market, lastUpdate: null, missingConfig, error: (e as Error).message };
  }
}
