export const MARKET_TZ = "America/New_York";

export interface EtParts {
  date: string; // YYYY-MM-DD in America/New_York
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  minutesOfDay: number;
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function etParts(d: Date): EtParts {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  const second = Number(p.second);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
    minutesOfDay: hour * 60 + minute,
  };
}

/** Convert an America/New_York wall-clock time to a UTC instant (DST aware). */
export function etWallToUtc(date: string, hour: number, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour, minute);
  let t = target + 5 * 3600_000;
  for (let i = 0; i < 3; i++) {
    const p = etParts(new Date(t));
    const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = target - wallAsUtc;
    if (diff === 0) break;
    t += diff;
  }
  return new Date(t);
}

/** UTC offset (hours) of New York at the given instant, e.g. -4 (EDT) or -5 (EST). */
export function etOffsetHours(d: Date): number {
  const p = etParts(d);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wallAsUtc - Math.floor(d.getTime() / 1000) * 1000) / 3600_000);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function formatEt(iso: string | Date | null | undefined, withDate = true): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    ...(withDate ? { month: "short", day: "numeric", year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}
