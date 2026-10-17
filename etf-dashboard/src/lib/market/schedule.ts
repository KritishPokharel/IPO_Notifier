import { REGULAR_OPEN_MIN, earlyCloseReason, holidayName, isTradingDay, sessionCloseMinutes } from "./calendar";
import { etParts } from "./time";

export type Slot = "morning" | "afternoon" | "evening";
export const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

export const SLOT_TIMES: Record<Slot, { hour: number; minute: number; label: string }> = {
  morning: { hour: 10, minute: 30, label: "10:30 AM ET" },
  afternoon: { hour: 14, minute: 30, label: "2:30 PM ET" },
  evening: { hour: 19, minute: 30, label: "7:30 PM ET" },
};

const MORNING = 10 * 60 + 30;
const AFTERNOON = 14 * 60 + 30;
const EVENING = 19 * 60 + 30;
/** Grace period after the close during which an afternoon run is still accepted. */
const AFTERNOON_GRACE_MIN = 15;

export interface SlotResolution {
  slot: Slot | null;
  sessionDate: string;
  reason: string;
}

/**
 * Determine which scheduled update (if any) should run at `now`.
 *
 * The GitHub Actions workflow fires at both the EDT and EST UTC equivalents of
 * each slot, so the job decides from New York wall-clock time. Later firings
 * inside the same window act as retries; completed slots are skipped by the job.
 */
export function resolveSlot(now: Date): SlotResolution {
  const p = etParts(now);
  const date = p.date;
  if (!isTradingDay(date)) {
    return { slot: null, sessionDate: date, reason: `Market closed (${holidayName(date) ?? "weekend"})` };
  }
  const m = p.minutesOfDay;
  const close = sessionCloseMinutes(date);
  if (m < MORNING) return { slot: null, sessionDate: date, reason: "Before the 10:30 AM ET update window" };
  if (m < Math.min(AFTERNOON, close)) return { slot: "morning", sessionDate: date, reason: "Morning window" };
  if (m >= AFTERNOON && m < close + AFTERNOON_GRACE_MIN) {
    return { slot: "afternoon", sessionDate: date, reason: "Afternoon window" };
  }
  if (m >= EVENING) return { slot: "evening", sessionDate: date, reason: "Evening (official close) window" };
  const early = earlyCloseReason(date);
  if (early && m >= close && m < EVENING) {
    return {
      slot: null,
      sessionDate: date,
      reason: `Early close at 1:00 PM ET (${early}); the 2:30 PM update is skipped and the evening update records the official close`,
    };
  }
  return { slot: null, sessionDate: date, reason: "Between scheduled update windows" };
}

export function isRegularSession(now: Date): boolean {
  const p = etParts(now);
  if (!isTradingDay(p.date)) return false;
  return p.minutesOfDay >= REGULAR_OPEN_MIN && p.minutesOfDay < sessionCloseMinutes(p.date);
}
