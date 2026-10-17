/** Recompute the analytics snapshot purely from stored data:  npm run job:recompute [-- --date YYYY-MM-DD] */
import { buildSnapshot } from "../src/lib/analytics/snapshot";
import { closeDb, getDb } from "../src/lib/db";
import { lastBarDates, latestSnapshot, saveSnapshot } from "../src/lib/repo";

async function main() {
  const db = await getDb();
  const i = process.argv.indexOf("--date");
  const latest = await latestSnapshot(db);
  const date = i >= 0 ? process.argv[i + 1] : (latest?.sessionDate ?? [...(await lastBarDates(db)).values()].sort().pop());
  if (!date) throw new Error("No data stored yet; run job:backfill first.");
  const snap = await buildSnapshot(db, date, latest?.sessionDate === date ? latest.slot : "history");
  await saveSnapshot(db, snap, null);
  for (const e of snap.etfs) {
    console.log(`${e.ticker.padEnd(5)} ${String(e.price ?? "—").padStart(10)} ${String(e.dailyChangePct ?? "—").padStart(9)}% 52wHigh ${e.high52w?.value ?? "—"} dd ${e.pctFromHigh52w ?? "—"}% [${e.status}]`);
  }
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
