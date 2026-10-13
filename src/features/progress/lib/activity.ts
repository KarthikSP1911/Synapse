/**
 * Calendar maths for the profile heatmap and streaks. Days are plain `YYYY-MM-DD` strings in the
 * user's own time zone, so an attempt late in the evening counts toward the day the user lived it.
 */

type DayCounts = ReadonlyMap<string, number>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the runtime knows this IANA zone name (e.g. "Asia/Kolkata"). */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// Building a formatter is far dearer than using one, and the day of every stored attempt is looked up.
const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day of `instant` in `timeZone`, as `YYYY-MM-DD`. */
export function dayKey(instant: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

/** Day arithmetic on calendar strings. Uses UTC midnight so daylight-saving shifts cannot skip a day. */
function parseDay(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  return new Date(parseDay(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekday(key: string): number {
  return new Date(parseDay(key)).getUTCDay();
}

interface StreakStats {
  /** Consecutive active days up to today. A streak is still alive if today has no activity yet but yesterday had. */
  current: number;
  longest: number;
  activeDays: number;
}

export function streaks(counts: DayCounts, today: string): StreakStats {
  const active = [...counts].filter(([, n]) => n > 0).map(([day]) => day).sort();

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of active) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  let current = 0;
  let cursor = (counts.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  while ((counts.get(cursor) ?? 0) > 0) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, activeDays: active.length };
}

export interface HeatmapDay {
  day: string;
  count: number;
  /** 0 = no activity, 1-4 = increasing activity. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Days after `today` that only pad out the final week. */
  future: boolean;
}

interface HeatmapMonth {
  /** Index of the week column the month label sits above. */
  week: number;
  label: string;
}

export interface Heatmap {
  /** Weeks, oldest first; each has seven days from Sunday to Saturday. */
  weeks: HeatmapDay[][];
  months: HeatmapMonth[];
  /** Activity of the busiest day, which sets the top of the colour scale. */
  max: number;
}

/** Colour level of a day's count relative to the busiest day of the period. */
export function levelFor(count: number, max: number): HeatmapDay["level"] {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as HeatmapDay["level"];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A GitHub-style grid of `weekCount` whole weeks (Sunday to Saturday), ending with the week that
 * contains `today`. The days of that week after today are marked `future`.
 */
export function buildHeatmap(counts: DayCounts, today: string, weekCount = 53): Heatmap {
  const lastWeekStart = addDays(today, -weekday(today));
  const firstWeekStart = addDays(lastWeekStart, -(weekCount - 1) * 7);

  let max = 0;
  const weeks: HeatmapDay[][] = [];
  const months: HeatmapMonth[] = [];
  let lastMonth = -1;

  for (let w = 0; w < weekCount; w++) {
    const start = addDays(firstWeekStart, w * 7);
    const days: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, d);
      const future = day > today;
      const count = future ? 0 : (counts.get(day) ?? 0);
      max = Math.max(max, count);
      days.push({ day, count, level: 0, future });
    }
    weeks.push(days);

    // A month label goes above the first week that starts in that month.
    const month = Number(days[0].day.slice(5, 7)) - 1;
    if (month !== lastMonth) {
      months.push({ week: w, label: MONTHS[month] });
      lastMonth = month;
    }
  }

  for (const week of weeks) {
    for (const cell of week) cell.level = levelFor(cell.count, max);
  }
  return { weeks, months, max };
}
