import type { LocalStore } from "@/features/offline/lib/guest/api";
import { browserTimeZone, dayOf, isDayKey } from "@/features/progress/lib/streak";

/**
 * The days a guest was active, kept in the browser.
 *
 * A guest's streak cannot be worked out from their saved sessions: a device keeps only the latest 40 practice and
 * 100 game sessions, so a long streak would shrink as old sessions are dropped. This is the small, permanent record
 * instead (one short string per day), written when an activity is saved. A day is stored as the guest lived it, in
 * the time zone the browser had at that moment, so travelling never rewrites history.
 *
 * Only guests have one. A signed-in user's days come from the account (the database keeps everything) plus the
 * sessions still waiting on the device to be uploaded.
 */

interface ActivityDays {
  /** Sorted, distinct `YYYY-MM-DD`. */
  days: string[];
  /** True once the days of sessions saved before this record existed have been added (see `backfillActivityDays`). */
  backfilled: boolean;
}

export const activityDaysKey = (storeKey: string): string => `${storeKey}:activity-days`;

/** A strictly validated copy of stored data. Anything damaged reads as an empty record. */
export function parseActivityDays(raw: unknown): ActivityDays {
  if (typeof raw !== "object" || raw === null) return { days: [], backfilled: false };
  const { days, backfilled } = raw as { days?: unknown; backfilled?: unknown };
  const valid = Array.isArray(days) ? days.filter(isDayKey) : [];
  return { days: [...new Set(valid)].sort(), backfilled: backfilled === true };
}

function read(storeKey: string): ActivityDays {
  try {
    return parseActivityDays(JSON.parse(localStorage.getItem(activityDaysKey(storeKey)) ?? "null"));
  } catch {
    // Storage unavailable or corrupt: start empty.
    return { days: [], backfilled: false };
  }
}

function write(storeKey: string, record: ActivityDays): boolean {
  try {
    localStorage.setItem(activityDaysKey(storeKey), JSON.stringify({ v: 1, ...record }));
    return true;
  } catch {
    return false;
  }
}

/** The days recorded for a guest store. */
export const loadActivityDays = (storeKey: string): string[] => read(storeKey).days;

/**
 * Notes that the guest finished something at `at` (epoch ms). Safe to repeat: a day already there is left alone.
 * Does nothing for a signed-in store. Returns false if nothing could be recorded.
 */
export function recordActivityDay(store: LocalStore, at: number, timeZone: string = browserTimeZone()): boolean {
  if (store.syncable) return false;
  const day = dayOf(at, timeZone);
  if (day === null) return false;
  const record = read(store.key);
  if (record.days.includes(day)) return true;
  return write(store.key, { ...record, days: [...record.days, day].sort() });
}

/**
 * Adds the days of sessions saved before this record existed, once. `derive` gives the days those sessions fall on in
 * the browser's zone, and is only called the first time. After that the record is complete by itself (every later
 * activity is written as it happens), so later calls change nothing: counting the saved sessions again, in a possibly
 * different time zone, could count one real day twice. Returns every recorded day.
 */
export function backfillActivityDays(store: LocalStore, derive: () => Iterable<string>): string[] {
  const record = read(store.key);
  if (store.syncable || record.backfilled) return record.days;
  const days = [...new Set([...record.days, ...[...derive()].filter(isDayKey)])].sort();
  // If the browser refuses the write, still answer with the union; the backfill is simply tried again next time.
  write(store.key, { days, backfilled: true });
  return days;
}
