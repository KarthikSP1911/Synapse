import { addDays, dayKey, isValidTimeZone, streaks } from "@/features/progress/lib/activity";

/**
 * Activity streaks: consecutive calendar days on which the user finished at least one qualifying activity.
 *
 * A day is a plain `YYYY-MM-DD` string in the user's own time zone (see `./activity.ts`). The set of such days is all
 * a streak needs, so the same few functions serve the server (days read from the database), a signed-in device
 * (days derived from its offline copy) and a guest (days kept in the browser), and any mix of them is a set union.
 * A day that several activities, retries or syncs all land on is still one day.
 */

// ---------------------------------------------------------------------------
// What counts. The server query in progress-queries.ts mirrors these rules in SQL.
// ---------------------------------------------------------------------------

/** A 2048 game that is given up counts once it has this many moves; one that ended or reached 2048 always counts. */
export const MIN_2048_MOVES = 20;

/** A practice question counts when it was answered (right or wrong). Skipped and timed-out questions do not. */
export const countsAsAnswer = (outcome: string): boolean => outcome === "correct" || outcome === "incorrect";

/** MindSprint and Number Recall only save a session once every round is played, so every saved one counts. */

/** A Sudoku counts when the puzzle was solved. A revealed solution or an abandoned game does not. */
export const sudokuCounts = (session: { completed: boolean }): boolean => session.completed;

/** A Queens or Zip puzzle counts when it was solved. An abandoned game does not, and opening the game never does. */
export const queensCounts = (session: { completed: boolean }): boolean => session.completed;
export const zipCounts = (session: { completed: boolean }): boolean => session.completed;

export const game2048Counts =(session: { gameOver: boolean; reached2048: boolean; moves: number }): boolean =>
  session.gameOver || session.reached2048 || session.moves >= MIN_2048_MOVES;

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

/** The time zone of this browser, or UTC if it cannot be told. */
export function browserTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

/** True for a real calendar day written `YYYY-MM-DD` (so not `2026-02-30`). */
export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

/** The calendar day of one instant (epoch ms) in `timeZone`, or null for a time that is not a date. */
export function dayOf(at: number, timeZone: string): string | null {
  if (!Number.isFinite(at)) return null;
  const instant = new Date(at);
  return Number.isNaN(instant.getTime()) ? null : dayKey(instant, timeZone);
}

/** The distinct calendar days that `times` (epoch ms) fall on in `timeZone`. */
export function activityDayKeys(times: Iterable<number>, timeZone: string): Set<string> {
  const days = new Set<string>();
  for (const at of times) {
    const day = dayOf(at, timeZone);
    if (day !== null) days.add(day);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

export interface StreakSummary {
  /** Consecutive active days up to today. Still alive when only today has nothing yet, so the day is not lost before it ends. */
  current: number;
  /** The longest run of consecutive active days, ever. */
  longest: number;
  /** Active days in the last 365, today included. */
  activeLastYear: number;
  todayDone: boolean;
}

/**
 * Streaks from a set of active days. Days after `today` (a device clock that ran ahead) and anything that is not a
 * real day are ignored.
 */
export function summarizeStreaks(days: Iterable<string>, today: string): StreakSummary {
  const counts = new Map<string, number>();
  for (const day of days) {
    if (isDayKey(day) && day <= today) counts.set(day, 1);
  }
  const { current, longest } = streaks(counts, today);
  const yearStart = addDays(today, -364);
  let activeLastYear = 0;
  for (const day of counts.keys()) if (day >= yearStart) activeLastYear += 1;
  return { current, longest, activeLastYear, todayDone: counts.has(today) };
}
