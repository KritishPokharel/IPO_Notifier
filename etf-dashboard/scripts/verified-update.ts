/** Free-tier EOD refresh, including weekends: npm run job:verified */
import { existsSync } from "node:fs";
import { closeDb, getDb } from "../src/lib/db";
import { runUpdate } from "../src/lib/jobs/update";
import { marketStatus } from "../src/lib/market/calendar";
import { providersFromEnv } from "../src/lib/providers";
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const providers = providersFromEnv({ ...process.env, SECONDARY_CLOSE_PROVIDER: "twelvedata" });
  if (!providers.primary || !providers.secondaryClose) throw new Error("Configure free TIINGO_API_KEY and TWELVEDATA_API_KEY accounts in .env.local.");
  const result = await runUpdate({ db: await getDb(), providers, transport: null, trigger: "cli", slot: "evening", sessionDate: marketStatus().lastCompletedSession, force: true });
  console.log(result.message);
  const verified = Object.values(result.tickers ?? {}).filter(t => t.status === "verified").length;
  console.log(`${verified} independently verified closes. AI eligibility also requires sufficient valid history.`);
  if (verified < 5) process.exitCode = 1;
}
main().catch(() => { console.error("Verified update failed. Check data keys, provider availability and database configuration."); process.exitCode = 1; }).finally(closeDb);
