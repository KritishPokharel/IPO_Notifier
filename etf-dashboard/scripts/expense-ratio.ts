/**
 * Record an expense ratio checked on the fund provider's official website.
 *   npm run expense-ratio -- VOO 0.03 "https://investor.vanguard.com/..."
 */
import { closeDb, getDb } from "../src/lib/db";
import { isTrackedTicker } from "../src/lib/etfs";
import { setExpenseRatio } from "../src/lib/repo";

async function main() {
  const [ticker, ratio, source] = process.argv.slice(2);
  const r = Number(ratio);
  if (!ticker || !isTrackedTicker(ticker) || !Number.isFinite(r) || r < 0 || r > 5 || !source) {
    throw new Error('Usage: npm run expense-ratio -- <TICKER> <ratio %> "<official source URL>"');
  }
  const db = await getDb();
  await setExpenseRatio(db, ticker.toUpperCase(), r, source, new Date().toISOString());
  console.log(`${ticker.toUpperCase()} expense ratio set to ${r}% (verified from ${source})`);
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
