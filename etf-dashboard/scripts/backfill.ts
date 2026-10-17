/** Load full daily history for all ETFs:  npm run job:backfill [-- --start 2015-01-01] */
import { buildSnapshot } from "../src/lib/analytics/snapshot";
import { closeDb, getDb } from "../src/lib/db";
import { runBackfill } from "../src/lib/jobs/update";
import { providersFromEnv } from "../src/lib/providers";
import { lastBarDates, saveSnapshot } from "../src/lib/repo";

async function main() {
  const i = process.argv.indexOf("--start");
  const db = await getDb();
  await runBackfill(db, providersFromEnv(), { start: i >= 0 ? process.argv[i + 1] : undefined });
  const last = [...(await lastBarDates(db)).values()].sort().pop();
  if (last) {
    await saveSnapshot(db, await buildSnapshot(db, last, "history"), null);
    console.log(`Snapshot computed for ${last}`);
  }
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
