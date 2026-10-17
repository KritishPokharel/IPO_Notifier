import { describe, expect, it } from "vitest";
import type { VerificationConfig } from "@/lib/config";
import type { DailyBar, Quote } from "@/lib/providers/types";
import { crossCheck, decideStatus, detectSplitDiscontinuity, isValidPrice, selectQuote, validateDailyBar } from "@/lib/validation";

const cfg: VerificationConfig = { closeTolerancePct: 0.1, closeToleranceAbs: 0.011, intradayTolerancePct: 0.5, maxQuoteAgeMinutes: 20, maxUnconfirmedMovePct: 15 };

const bar = (o: Partial<DailyBar>): DailyBar => ({
  date: "2026-10-16",
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 1000,
  adjOpen: null,
  adjHigh: null,
  adjLow: null,
  adjClose: null,
  divCash: 0,
  splitFactor: 1,
  ...o,
});

describe("price validity", () => {
  it("rejects missing, zero, negative and malformed values", () => {
    for (const v of [null, undefined, 0, -1, NaN, Infinity, "100"]) expect(isValidPrice(v)).toBe(false);
    expect(isValidPrice(0.01)).toBe(true);
  });
  it("flags invalid daily bars", () => {
    expect(validateDailyBar(bar({ close: 0 }), 100, cfg)[0].code).toBe("invalid_close");
    expect(validateDailyBar(bar({ low: 102, high: 101 }), 100, cfg).map((i) => i.code)).toContain("low_above_high");
    expect(validateDailyBar(bar({ close: 105 }), 100, cfg).map((i) => i.code)).toContain("close_outside_range");
    expect(validateDailyBar(bar({ volume: -5 }), 100, cfg).map((i) => i.code)).toContain("invalid_volume");
    expect(validateDailyBar(bar({}), 99.5, cfg)).toEqual([]);
  });
});

describe("split discontinuities", () => {
  it("detects an unrecorded split-like jump", () => {
    expect(detectSplitDiscontinuity(400, 100, 1, 15)?.severity).toBe("error");
  });
  it("accepts a recorded split", () => {
    expect(detectSplitDiscontinuity(400, 100, 4, 15)?.severity).toBe("info");
  });
  it("flags large non-split moves as needing confirmation", () => {
    expect(detectSplitDiscontinuity(100, 80, 1, 15)?.code).toBe("large_move");
    expect(detectSplitDiscontinuity(100, 90, 1, 15)).toBeNull();
  });
});

describe("cross-check and status", () => {
  it("agreeing sources -> verified", () => {
    const c = crossCheck(500.12, 500.13, "Massive", 0.1, 0.011);
    expect(c.outcome).toBe("agree");
    expect(decideStatus([], c)).toBe("verified");
  });
  it("material disagreement -> disputed, never silently picks one", () => {
    const c = crossCheck(500, 495, "Massive", 0.1);
    expect(c.outcome).toBe("disagree");
    expect(decideStatus([], c)).toBe("disputed");
  });
  it("no second source -> single-source validated, never verified", () => {
    expect(decideStatus([], null)).toBe("single_source");
    expect(decideStatus([], crossCheck(500, null, "Massive", 0.1))).toBe("single_source");
  });
  it("errors and large unconfirmed moves are disputed; large confirmed moves verified", () => {
    expect(decideStatus([{ code: "invalid_close", severity: "error", message: "" }], null)).toBe("disputed");
    const lm = [{ code: "large_move", severity: "warning" as const, message: "" }];
    expect(decideStatus(lm, null)).toBe("disputed");
    expect(decideStatus(lm, crossCheck(80, 80, "X", 0.1))).toBe("verified");
  });
  it("stale data is labelled stale", () => {
    expect(decideStatus([{ code: "stale_quote", severity: "warning", message: "" }], null)).toBe("stale");
  });
});

describe("intraday quote selection", () => {
  const now = new Date("2026-10-16T14:30:00Z"); // 10:30 ET
  const q = (candidates: Quote["candidates"]): Quote => ({ ticker: "VOO", source: "T", candidates, prevClose: 100, isDelayed: false });
  it("uses a fresh last-trade price", () => {
    const r = selectQuote(q([{ price: 101, field: "last", timestamp: "2026-10-16T14:29:30Z" }]), "2026-10-16", now, cfg);
    expect(r.candidate?.price).toBe(101);
    expect(r.issues).toEqual([]);
  });
  it("falls back to the next candidate when the first is invalid", () => {
    const r = selectQuote(
      q([
        { price: 0, field: "last", timestamp: "2026-10-16T14:29:30Z" },
        { price: 100.5, field: "mid", timestamp: "2026-10-16T14:29:50Z" },
      ]),
      "2026-10-16",
      now,
      cfg,
    );
    expect(r.candidate?.field).toBe("mid");
  });
  it("flags quotes from a previous session as stale", () => {
    const r = selectQuote(q([{ price: 101, field: "last", timestamp: "2026-10-15T19:59:00Z" }]), "2026-10-16", now, cfg);
    expect(r.issues.map((i) => i.code)).toContain("stale_quote");
  });
  it("flags old same-day quotes as stale", () => {
    const r = selectQuote(q([{ price: 101, field: "last", timestamp: "2026-10-16T13:45:00Z" }]), "2026-10-16", now, cfg);
    expect(r.issues.map((i) => i.code)).toContain("stale_quote");
  });
  it("rejects quotes without timestamps", () => {
    const r = selectQuote(q([{ price: 101, field: "last", timestamp: null }]), "2026-10-16", now, cfg);
    expect(r.candidate).toBeNull();
    expect(r.issues[0].code).toBe("no_valid_quote");
  });
});
