import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verificationConfig } from "@/lib/config";
import type { Db } from "@/lib/db";
import { insertObservation, latestObservations, loadBars, setBarVerification, upsertDailyBars } from "@/lib/repo";
import { getAlertSettings, saveAlertSettings, defaultAlertSettings } from "@/lib/settings";
import { syntheticBars, testDb } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => {
  await db.close();
});

const cfg = verificationConfig();

describe("daily bar persistence", () => {
  it("stores bars idempotently and rejects invalid ones", async () => {
    const bars = syntheticBars("2026-09-01", "2026-09-30");
    const r1 = await upsertDailyBars(db, "VOO", bars, "P", new Date().toISOString(), cfg);
    expect(r1.inserted).toBe(bars.length);
    await upsertDailyBars(db, "VOO", bars, "P", new Date().toISOString(), cfg);
    expect((await loadBars(db, ["VOO"])).get("VOO")).toHaveLength(bars.length);

    const bad = { ...syntheticBars("2026-10-01", "2026-10-01")[0], close: 0 };
    const r2 = await upsertDailyBars(db, "VOO", [bad], "P", new Date().toISOString(), cfg);
    expect(r2.invalid).toHaveLength(1);
    expect((await loadBars(db, ["VOO"])).get("VOO")!.some((b) => b.date === "2026-10-01")).toBe(false);
  });

  it("does not silently overwrite a verified close; a material revision becomes disputed", async () => {
    const [bar] = syntheticBars("2026-09-15", "2026-09-15");
    await setBarVerification(db, "VOO", bar.date, { status: "verified", source: "S", value: bar.close, diffPct: 0, note: null });
    const revised = { ...bar, close: bar.close * 1.03, high: bar.close * 1.04, adjClose: bar.close * 1.03 };
    const r = await upsertDailyBars(db, "VOO", [revised], "P", new Date().toISOString(), cfg);
    expect(r.revisedVerified).toEqual([bar.date]);
    const stored = (await loadBars(db, ["VOO"])).get("VOO")!.find((b) => b.date === bar.date)!;
    expect(stored.verificationStatus).toBe("disputed");
  });
});

describe("observations", () => {
  const base = {
    ticker: "VTI",
    slot: "morning",
    kind: "intraday" as const,
    priceField: "last",
    prevClose: 100,
    prevCloseDate: "2026-10-15",
    source: "P",
    isDelayed: false,
    status: "single_source" as const,
    secondarySource: null,
    secondaryPrice: null,
    discrepancyPct: null,
    issues: [],
    jobRunId: null,
  };
  it("returns the newest session and prefers official closes; older data never replaces newer", async () => {
    await insertObservation(db, { ...base, sessionDate: "2026-10-16", price: 101, quoteTimestamp: "2026-10-16T14:29:00Z", retrievedAt: "2026-10-16T14:30:00Z" });
    await insertObservation(db, { ...base, sessionDate: "2026-10-16", kind: "close", slot: "evening", price: 102, quoteTimestamp: "2026-10-16T20:00:00Z", retrievedAt: "2026-10-16T23:30:00Z", status: "verified" });
    // An older observation retrieved later must not win
    await insertObservation(db, { ...base, sessionDate: "2026-10-15", price: 99, quoteTimestamp: "2026-10-15T18:29:00Z", retrievedAt: "2026-10-17T01:00:00Z" });
    const latest = (await latestObservations(db)).get("VTI")!;
    expect(latest.price).toBe(102);
    expect(latest.kind).toBe("close");
    expect(latest.status).toBe("verified");
    expect((await latestObservations(db, "2026-10-15")).get("VTI")!.price).toBe(99);
  });
  it("deduplicates identical observations", async () => {
    const o = { ...base, ticker: "VUG", sessionDate: "2026-10-16", price: 50, quoteTimestamp: "2026-10-16T14:29:00Z", retrievedAt: "2026-10-16T14:30:00Z" };
    expect(await insertObservation(db, o)).toBe(true);
    expect(await insertObservation(db, o)).toBe(false);
  });
});

describe("settings", () => {
  it("round-trips and validates alert settings", async () => {
    await saveAlertSettings(db, { ...defaultAlertSettings(), thresholdPct: 4, recipient: "x@example.com" });
    expect((await getAlertSettings(db)).thresholdPct).toBe(4);
    await expect(saveAlertSettings(db, { ...defaultAlertSettings(), thresholdPct: -1 })).rejects.toThrow();
  });
});
