import { describe, expect, it, vi } from "vitest";
import { computeEtfMetrics } from "@/lib/analytics/metrics";
import type { Snapshot } from "@/lib/analytics/snapshot-types";
import { ETFS } from "@/lib/etfs";
import { rankEtfs } from "@/lib/ai/ranking";
import { generateReport, parseReport } from "@/lib/ai/nvidia";
import { syntheticBars } from "./helpers";
const now = new Date("2026-10-17T12:00:00Z");
function snapshot() {
  return { etfs: ETFS.map((def, i) => {
    const bars = syntheticBars("2025-01-02", "2026-10-16", 100 + i * 10);
    return computeEtfMetrics(def, bars, { price: bars.at(-1)!.close, kind: "close", sessionDate: "2026-10-16", slot: "evening", source: "Tiingo", priceField: "Official close", quoteTimestamp: null, retrievedAt: now.toISOString(), isDelayed: false, status: "verified", issues: [], secondarySource: "Twelve Data", secondaryPrice: bars.at(-1)!.close, discrepancyPct: 0 }, { ratio: def.referenceExpenseRatio, status: "reference", source: null, verifiedAt: null });
  }) } as Snapshot;
}
describe("AI research eligibility and ranking", () => {
  it("returns five deterministic candidates with at most two per category", () => {
    const s = snapshot(); const a = rankEtfs(s, "balanced", now);
    expect(a.picks).toHaveLength(5);
    expect(a).toEqual(rankEtfs(s, "balanced", now));
    for (const p of a.picks) expect(a.picks.filter(x => x.etf.category === p.etf.category).length).toBeLessThanOrEqual(2);
  });
  it("rejects stale, disputed, single-source, intraday and insufficient history without padding", () => {
    const s = snapshot();
    s.etfs[0].latest!.sessionDate = "2026-10-15";
    s.etfs[1].status = "disputed";
    s.etfs[2].status = "single_source";
    s.etfs[3].latest!.kind = "intraday";
    s.etfs[4].historySessions = 200;
    s.etfs[5].vol1y = NaN;
    s.etfs[6].latest!.secondarySource = "Tiingo";
    s.etfs[7].latest!.secondaryPrice = 0;
    const a = rankEtfs(s, "balanced", now, { VXUS: "Missing sessions" });
    expect(a.excluded).toHaveLength(9);
    expect(a.picks.length).toBeLessThan(5);
  });
  it("does not use stale Friday prices after the next completed session", () => {
    expect(rankEtfs(snapshot(), "balanced", new Date("2026-10-19T22:00:00Z")).picks).toHaveLength(0);
  });
  it("changes ranking for growth versus defensive objectives", () => {
    const s = snapshot();
    s.etfs.forEach((e, i) => { e.priceReturns["1Y"] = i * 10; e.vol1y = i * 5 + 1; e.maxDrawdown1y = { pct: -(i * 4) }; e.pctFromMa200 = i; });
    expect(rankEtfs(s, "growth", now).picks[0].etf.ticker).not.toBe(rankEtfs(s, "defensive", now).picks[0].etf.ticker);
  });
});
const tickers = ["VOO", "VTI", "SCHG", "VUG", "VXUS"];
const report = { overview: "Overview", marketContext: "Context", portfolioRisks: "Risk", limitations: "Limit", picks: tickers.map(ticker => ({ ticker, thesis: "Thesis", risk: "Risk", watchFor: "Watch" })) };
describe("NVIDIA boundary", () => {
  it("accepts complete JSON and rejects invented or duplicate tickers", () => {
    expect(parseReport(JSON.stringify(report), tickers)).toEqual(report);
    expect(() => parseReport(JSON.stringify({ ...report, picks: report.picks.map(p => ({ ...p, ticker: "FAKE" })) }), tickers)).toThrow();
    expect(() => parseReport('{"overview":"partial"}', tickers)).toThrow();
  });
  it("sends context server-side and only accepts completed output", async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(report) } }] })));
    expect(await generateReport({ evidence: "test" }, tickers, "test-key", undefined, mock)).toEqual(report);
    expect(mock.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const body = JSON.parse(mock.mock.calls[0][1]!.body as string);
    expect(body.messages[1].content).toContain("evidence");
    mock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(report) } }] })));
    await expect(generateReport({}, tickers, "test-key", undefined, mock)).rejects.toThrow("incomplete");
  });
  it("does not expose provider response bodies or secrets", async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret-provider-diagnostic", { status: 401 }));
    await expect(generateReport({}, tickers, "test-key", undefined, mock)).rejects.toThrow("NVIDIA rejected");
  });
});
