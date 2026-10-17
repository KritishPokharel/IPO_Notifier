import { addDays, dayOfWeek, etParts } from "./time";

/**
 * NYSE trading calendar (regular holidays, observance rules, early closes and
 * one-off closures). Regular session 9:30–16:00 ET; early closes at 13:00 ET.
 */

const SPECIAL_CLOSURES: Record<string, string> = {
  "2001-09-11": "September 11 attacks",
  "2001-09-12": "September 11 attacks",
  "2001-09-13": "September 11 attacks",
  "2001-09-14": "September 11 attacks",
  "2004-06-11": "National Day of Mourning (Ronald Reagan)",
  "2007-01-02": "National Day of Mourning (Gerald Ford)",
  "2012-10-29": "Hurricane Sandy",
  "2012-10-30": "Hurricane Sandy",
  "2018-12-05": "National Day of Mourning (George H.W. Bush)",
  "2025-01-09": "National Day of Mourning (Jimmy Carter)",
};

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = dayOfWeek(ymd(year, month, 1));
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return ymd(year, month, day);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = dayOfWeek(ymd(year, month, daysInMonth));
  return ymd(year, month, daysInMonth - ((last - weekday + 7) % 7));
}

/** Anonymous Gregorian algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** Saturday holidays move to Friday, Sunday holidays move to Monday. */
function observed(date: string): string {
  const dow = dayOfWeek(date);
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

const holidayCache = new Map<number, Map<string, string>>();

export function nyseHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const h = new Map<string, string>();
  // New Year's Day: if it falls on Saturday, NYSE does not close the preceding Friday.
  const ny = ymd(year, 1, 1);
  if (dayOfWeek(ny) !== 6) h.set(observed(ny), "New Year's Day");
  h.set(nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
  h.set(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
  h.set(addDays(easterSunday(year), -2), "Good Friday");
  h.set(lastWeekday(year, 5, 1), "Memorial Day");
  if (year >= 2022) h.set(observed(ymd(year, 6, 19)), "Juneteenth National Independence Day");
  h.set(observed(ymd(year, 7, 4)), "Independence Day");
  h.set(nthWeekday(year, 9, 1, 1), "Labor Day");
  h.set(nthWeekday(year, 11, 4, 4), "Thanksgiving Day");
  h.set(observed(ymd(year, 12, 25)), "Christmas Day");
  for (const [d, name] of Object.entries(SPECIAL_CLOSURES)) {
    if (d.startsWith(`${year}-`)) h.set(d, name);
  }
  holidayCache.set(year, h);
  return h;
}

export function holidayName(date: string): string | null {
  return nyseHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

export function isTradingDay(date: string): boolean {
  const dow = dayOfWeek(date);
  if (dow === 0 || dow === 6) return false;
  return holidayName(date) === null;
}

/** Returns the reason for a 1:00 PM ET early close, or null. */
export function earlyCloseReason(date: string): string | null {
  if (!isTradingDay(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const dow = dayOfWeek(date);
  if (m === 7 && d === 3 && dow >= 1 && dow <= 4) return "Day before Independence Day";
  if (m === 12 && d === 24 && dow >= 1 && dow <= 4) return "Christmas Eve";
  if (date === addDays(nthWeekday(y, 11, 4, 4), 1)) return "Day after Thanksgiving";
  return null;
}

export const REGULAR_OPEN_MIN = 9 * 60 + 30;
export const REGULAR_CLOSE_MIN = 16 * 60;
export const EARLY_CLOSE_MIN = 13 * 60;

export function sessionCloseMinutes(date: string): number {
  return earlyCloseReason(date) ? EARLY_CLOSE_MIN : REGULAR_CLOSE_MIN;
}

export function previousTradingDay(date: string): string {
  let d = addDays(date, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

export function nextTradingDay(date: string): string {
  let d = addDays(date, 1);
  while (!isTradingDay(d)) d = addDays(d, 1);
  return d;
}

export type MarketPhase = "pre-market" | "open" | "after-hours" | "closed";

export interface MarketStatus {
  phase: MarketPhase;
  etDate: string;
  isTradingDay: boolean;
  /** Most recent session whose regular trading has fully completed. */
  lastCompletedSession: string;
  /** Session currently trading (if open) or about to trade today. */
  currentSession: string | null;
  closeMinutes: number | null;
  holiday: string | null;
  earlyClose: string | null;
}

export function marketStatus(now: Date = new Date()): MarketStatus {
  const p = etParts(now);
  const trading = isTradingDay(p.date);
  const closeMin = trading ? sessionCloseMinutes(p.date) : null;
  let phase: MarketPhase = "closed";
  if (trading && closeMin !== null) {
    if (p.minutesOfDay < REGULAR_OPEN_MIN) phase = "pre-market";
    else if (p.minutesOfDay < closeMin) phase = "open";
    else phase = "after-hours";
  }
  const lastCompletedSession =
    trading && closeMin !== null && p.minutesOfDay >= closeMin ? p.date : previousTradingDay(p.date);
  return {
    phase,
    etDate: p.date,
    isTradingDay: trading,
    lastCompletedSession,
    currentSession: trading ? p.date : null,
    closeMinutes: closeMin,
    holiday: holidayName(p.date) ?? (trading ? null : "Weekend"),
    earlyClose: earlyCloseReason(p.date),
  };
}

/** Count trading days in (from, to]. */
export function tradingDaysBetween(from: string, to: string): number {
  let n = 0;
  let d = from;
  while (d < to) {
    d = addDays(d, 1);
    if (isTradingDay(d)) n++;
  }
  return n;
}
