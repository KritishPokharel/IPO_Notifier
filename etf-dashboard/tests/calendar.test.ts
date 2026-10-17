import { describe, expect, it } from "vitest";
import {
  earlyCloseReason,
  easterSunday,
  holidayName,
  isTradingDay,
  marketStatus,
  nextTradingDay,
  previousTradingDay,
  sessionCloseMinutes,
} from "@/lib/market/calendar";
import { resolveSlot } from "@/lib/market/schedule";
import { etParts, etWallToUtc } from "@/lib/market/time";

describe("NYSE holidays", () => {
  it("2026 full-day closures", () => {
    for (const d of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]) {
      expect(isTradingDay(d), d).toBe(false);
    }
  });
  it("observes Saturday Independence Day on Friday", () => {
    expect(holidayName("2026-07-03")).toBe("Independence Day");
  });
  it("observes Sunday holidays on Monday", () => {
    expect(holidayName("2027-07-05")).toBe("Independence Day");
    expect(holidayName("2022-12-26")).toBe("Christmas Day");
  });
  it("does not close the Friday before a Saturday New Year's Day", () => {
    expect(isTradingDay("2021-12-31")).toBe(true);
  });
  it("Good Friday via Easter computation", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(isTradingDay("2025-04-18")).toBe(false);
  });
  it("one-off closures", () => {
    expect(isTradingDay("2025-01-09")).toBe(false);
    expect(isTradingDay("2012-10-29")).toBe(false);
  });
  it("weekends are not trading days", () => {
    expect(isTradingDay("2026-10-17")).toBe(false);
    expect(isTradingDay("2026-10-18")).toBe(false);
    expect(isTradingDay("2026-10-16")).toBe(true);
  });
});

describe("early closes", () => {
  it("day after Thanksgiving and Christmas Eve close at 1:00 PM", () => {
    expect(earlyCloseReason("2026-11-27")).not.toBeNull();
    expect(earlyCloseReason("2026-12-24")).not.toBeNull();
    expect(sessionCloseMinutes("2026-11-27")).toBe(13 * 60);
    expect(sessionCloseMinutes("2026-10-16")).toBe(16 * 60);
  });
  it("July 3 early close when it is a regular weekday", () => {
    expect(earlyCloseReason("2025-07-03")).not.toBeNull();
  });
});

describe("previous/next trading day", () => {
  it("skips weekends and holidays", () => {
    expect(previousTradingDay("2026-10-19")).toBe("2026-10-16");
    expect(previousTradingDay("2026-11-27")).toBe("2026-11-25");
    expect(nextTradingDay("2026-12-24")).toBe("2026-12-28");
    expect(previousTradingDay("2026-01-20")).toBe("2026-01-16");
  });
});

describe("New York time and DST", () => {
  it("converts wall-clock ET to UTC across DST", () => {
    expect(etWallToUtc("2026-03-06", 10, 30).toISOString()).toBe("2026-03-06T15:30:00.000Z"); // EST
    expect(etWallToUtc("2026-03-09", 10, 30).toISOString()).toBe("2026-03-09T14:30:00.000Z"); // EDT
    expect(etWallToUtc("2026-11-02", 19, 30).toISOString()).toBe("2026-11-03T00:30:00.000Z"); // EST again
  });
  it("etParts reads New York wall clock", () => {
    const p = etParts(new Date("2026-07-01T23:30:00Z"));
    expect(p.date).toBe("2026-07-01");
    expect(p.minutesOfDay).toBe(19 * 60 + 30);
  });
});

describe("scheduled slots", () => {
  it("resolves the three windows during EDT", () => {
    expect(resolveSlot(new Date("2026-10-16T14:30:00Z")).slot).toBe("morning");
    expect(resolveSlot(new Date("2026-10-16T18:30:00Z")).slot).toBe("afternoon");
    expect(resolveSlot(new Date("2026-10-16T23:30:00Z")).slot).toBe("evening");
  });
  it("the EST-offset cron firing runs as a retry inside the same window during EDT", () => {
    expect(resolveSlot(new Date("2026-10-16T15:30:00Z")).slot).toBe("morning");
  });
  it("during EST the EDT-offset firing is too early and is skipped", () => {
    expect(resolveSlot(new Date("2026-12-01T14:30:00Z")).slot).toBeNull(); // 9:30 EST
    expect(resolveSlot(new Date("2026-12-01T15:30:00Z")).slot).toBe("morning");
    expect(resolveSlot(new Date("2026-12-02T00:30:00Z")).slot).toBe("evening");
  });
  it("evening run after midnight UTC is attributed to the correct ET session", () => {
    const r = resolveSlot(new Date("2026-12-02T00:30:00Z"));
    expect(r.sessionDate).toBe("2026-12-01");
  });
  it("skips weekends and holidays", () => {
    expect(resolveSlot(new Date("2026-10-17T14:30:00Z")).slot).toBeNull();
    expect(resolveSlot(new Date("2026-11-26T15:30:00Z")).slot).toBeNull();
  });
  it("skips the 2:30 PM update on early-close days but runs the evening close", () => {
    expect(resolveSlot(new Date("2026-11-27T19:30:00Z")).slot).toBeNull(); // 2:30 PM EST
    expect(resolveSlot(new Date("2026-11-27T15:30:00Z")).slot).toBe("morning");
    expect(resolveSlot(new Date("2026-11-28T00:30:00Z")).slot).toBe("evening");
  });
});

describe("market status", () => {
  it("reports the last completed session on weekends", () => {
    const s = marketStatus(new Date("2026-10-17T16:00:00Z"));
    expect(s.phase).toBe("closed");
    expect(s.lastCompletedSession).toBe("2026-10-16");
  });
  it("during the session the last completed session is the prior day", () => {
    const s = marketStatus(new Date("2026-10-16T15:00:00Z"));
    expect(s.phase).toBe("open");
    expect(s.lastCompletedSession).toBe("2026-10-15");
  });
});
