import { describe, expect, it } from "vitest";
import {
  annualizedVolatility,
  breachesDailyDrop,
  classifyDrawdown,
  dailyChange,
  drawdownFromHigh,
  maxDrawdownWithDates,
  periodReturn,
  sma,
  splitAdjust,
  streak,
  windowExtremes,
  ytdReturn,
  type RawBar,
} from "@/lib/analytics/calc";
import { annualFee } from "@/lib/etfs";

describe("daily change", () => {
  it("computes dollar and percent change vs previous close", () => {
    const c = dailyChange(95, 100);
    expect(c.abs).toBeCloseTo(-5);
    expect(c.pct).toBeCloseTo(-5);
    expect(dailyChange(412.37, 400).pct).toBeCloseTo(3.0925, 4);
  });
});

describe("alert threshold (strictly greater than 5% decline)", () => {
  it("does not trigger at exactly -5.00%", () => {
    expect(breachesDailyDrop(-5, 5)).toBe(false);
    expect(breachesDailyDrop(dailyChange(95, 100).pct, 5)).toBe(false);
  });
  it("triggers at -5.01% and below", () => {
    expect(breachesDailyDrop(-5.01, 5)).toBe(true);
    expect(breachesDailyDrop(-12, 5)).toBe(true);
  });
  it("does not trigger for smaller declines or gains", () => {
    expect(breachesDailyDrop(-4.99, 5)).toBe(false);
    expect(breachesDailyDrop(6, 5)).toBe(false);
  });
  it("is not fooled by floating point noise around the boundary", () => {
    // 100 -> 95 via float arithmetic can produce -5.000000000000004
    expect(breachesDailyDrop(((94.99999999999999 - 100) / 100) * 100, 5)).toBe(false);
  });
  it("respects custom thresholds", () => {
    expect(breachesDailyDrop(-3.5, 3)).toBe(true);
    expect(breachesDailyDrop(-3, 3)).toBe(false);
  });
});

describe("returns", () => {
  const values = [100, 101, 102, 103, 104, 110];
  it("computes n-session returns", () => {
    expect(periodReturn(values, 5)).toBeCloseTo(10);
    expect(periodReturn(values, 1)).toBeCloseTo((110 / 104 - 1) * 100);
  });
  it("returns null when history is insufficient", () => {
    expect(periodReturn(values, 6)).toBeNull();
    expect(periodReturn([], 1)).toBeNull();
  });
  it("YTD uses the last close of the prior year", () => {
    expect(ytdReturn(["2025-12-30", "2025-12-31", "2026-01-02", "2026-03-01"], [90, 100, 101, 120])).toBeCloseTo(20);
  });
  it("YTD is null without a prior-year close", () => {
    expect(ytdReturn(["2026-01-02", "2026-03-01"], [100, 120])).toBeNull();
  });
});

describe("highs, lows and drawdown", () => {
  it("finds window extremes with dates", () => {
    const dates = ["d1", "d2", "d3", "d4"];
    const r = windowExtremes(dates, [10, 15, 12, 11], [9, 13, 8, 10], 3)!;
    expect(r.high).toEqual({ value: 15, date: "d2" });
    expect(r.low).toEqual({ value: 8, date: "d3" });
  });
  it("drawdown formula", () => {
    expect(drawdownFromHigh(80, 100)).toBeCloseTo(-20);
    expect(drawdownFromHigh(100, 100)).toBe(0);
  });
  it("classifies drawdowns at the boundaries", () => {
    expect(classifyDrawdown(0)).toBe("Near high");
    expect(classifyDrawdown(4.99)).toBe("Near high");
    expect(classifyDrawdown(5)).toBe("Mild pullback");
    expect(classifyDrawdown(10)).toBe("Moderate correction");
    expect(classifyDrawdown(15)).toBe("Significant correction");
    expect(classifyDrawdown(20)).toBe("Bear-market territory");
    expect(classifyDrawdown(29.99)).toBe("Bear-market territory");
    expect(classifyDrawdown(30)).toBe("Severe drawdown");
  });
  it("computes maximum drawdown with peak and trough", () => {
    const r = maxDrawdownWithDates([100, 120, 90, 110, 60, 130], ["a", "b", "c", "d", "e", "f"]);
    expect(r.pct).toBeCloseTo(-50);
    expect(r.peakDate).toBe("b");
    expect(r.troughDate).toBe("e");
  });
});

describe("moving averages, volatility and streaks", () => {
  it("simple moving average", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(sma([1, 2], 3)).toBeNull();
  });
  it("annualized volatility is zero for constant growth and positive otherwise", () => {
    const steady = Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i);
    expect(annualizedVolatility(steady, 20)).toBeCloseTo(0, 8);
    const choppy = Array.from({ length: 30 }, (_, i) => (i % 2 ? 101 : 99));
    expect(annualizedVolatility(choppy, 20)!).toBeGreaterThan(20);
    expect(annualizedVolatility([100, 101], 20)).toBeNull();
  });
  it("counts consecutive up/down sessions", () => {
    expect(streak([1, 2, 3, 2, 1, 0])).toEqual({ direction: "down", count: 3 });
    expect(streak([3, 2, 3, 4])).toEqual({ direction: "up", count: 2 });
  });
});

describe("split adjustment", () => {
  const bar = (date: string, close: number, splitFactor = 1, adjClose: number | null = null): RawBar => ({
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    adjClose,
    splitFactor,
  });
  it("divides pre-split prices by the split factor so there is no artificial drop", () => {
    const adj = splitAdjust([bar("d1", 400), bar("d2", 410), bar("d3", 103, 4), bar("d4", 104)]);
    expect(adj.map((b) => b.sClose)).toEqual([100, 102.5, 103, 104]);
  });
  it("uses dividend-adjusted closes for the total-return series when available", () => {
    const adj = splitAdjust([bar("d1", 100, 1, 98), bar("d2", 101, 1, 101)]);
    expect(adj[0].tClose).toBe(98);
    expect(adj[0].sClose).toBe(100);
  });
});

it("annual fee per investment", () => {
  expect(annualFee(10_000, 0.03)).toBeCloseTo(3);
  expect(annualFee(10_000, 0.35)).toBeCloseTo(35);
});
