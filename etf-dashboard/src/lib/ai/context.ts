import "server-only";
import { buildSnapshot } from "../analytics/snapshot";
import { buildWatchlist } from "../analytics/watchlist";
import { getDb } from "../db";
import { marketStatus, previousTradingDay } from "../market/calendar";
import { loadBars } from "../repo";
import { getWatchlistSettings } from "../settings";
import { ETFS } from "../etfs";
import { METHODOLOGY, rankEtfs, type Profile } from "./ranking";

export async function analysisContext(profile: Profile, now = new Date()) {
  const db = await getDb();
  const session = marketStatus(now).lastCompletedSession;
  // Build a completed-session snapshot even if the dashboard's latest snapshot is intraday.
  const [snapshot, settings, targets, bars] = await Promise.all([
    buildSnapshot(db, session, "ai-close", now),
    getWatchlistSettings(db),
    db.query("SELECT ticker, direction, target_price FROM target_price_alerts WHERE enabled = true ORDER BY ticker, target_price"),
    loadBars(db, ETFS.map(e => e.ticker), session),
  ]);
  const problems: Record<string, string> = {};
  for (const e of snapshot.etfs) {
    const history = (bars.get(e.ticker) ?? []).slice(-253);
    if (history.some(b => b.verificationStatus === "disputed" || !Number.isFinite(b.close) || b.close <= 0)) problems[e.ticker] = "Historical prices contain disputed or invalid observations.";
    if (history.some((b, i) => i > 0 && history[i - 1].date !== previousTradingDay(b.date))) problems[e.ticker] = "Historical series has missing trading sessions.";
  }
  const ranking = rankEtfs(snapshot, profile, now, problems);
  return {
    snapshot, ranking, methodology: METHODOLOGY,
    watchlist: buildWatchlist(snapshot.etfs, settings).map(w => ({ ticker: w.etf.ticker, flags: w.flags })),
    targets,
    sources: ETFS.map(e => ({ ticker: e.ticker, issuerUrl: e.providerUrl })),
    dataCaveat: "Latest closes are cross-checked; historical analytics are calculated from Tiingo history and are not all independently cross-checked. Reference fees are not verified. No holdings-level, live news, macroeconomic, valuation, tax or personal portfolio data is available.",
  };
}
