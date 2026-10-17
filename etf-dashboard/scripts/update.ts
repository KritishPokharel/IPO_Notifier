/**
 * Scheduled update entry point (GitHub Actions / cron).
 *   npm run job:update                      # resolve slot from the New York clock
 *   npm run job:update -- --slot evening --date 2026-10-16 [--force]
 */
import { closeDb, getDb } from "../src/lib/db";
import { transportFromEnv } from "../src/lib/email";
import { runUpdate } from "../src/lib/jobs/update";
import type { Slot } from "../src/lib/market/schedule";
import { providersFromEnv } from "../src/lib/providers";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slot = arg("slot") as Slot | undefined;
  if (slot && !["morning", "afternoon", "evening"].includes(slot)) throw new Error(`Invalid --slot ${slot}`);
  const providers = providersFromEnv();
  if (providers.missing.length) console.warn(`[update] Missing configuration: ${providers.missing.join(", ")}`);
  const db = await getDb();
  const res = await runUpdate({
    db,
    providers,
    transport: transportFromEnv(),
    trigger: slot ? "cli" : "scheduled",
    slot,
    sessionDate: arg("date"),
    force: process.argv.includes("--force"),
  });
  console.log(JSON.stringify({ status: res.status, message: res.message, slot: res.slot, session: res.sessionDate, tickers: res.tickers }, null, 2));
  await closeDb();
  // "partial" exits 0 so later retry windows pick it up; only hard failures fail the workflow.
  process.exit(res.status === "failed" ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
