import type { LocalStore } from "@/features/offline/lib/guest/api";
import { backfillActivityDays } from "@/features/offline/lib/activity-days";
import { loadGuestData } from "@/features/offline/lib/guest/storage";
import { game2048History } from "@/features/games/game2048/lib/storage";
import { mindsprintHistory } from "@/features/games/mindsprint/lib/storage";
import { recallHistory } from "@/features/games/recall/lib/storage";
import { sudokuHistory } from "@/features/games/sudoku/lib/storage";
import { activityDayKeys, browserTimeZone, countsAsAnswer, game2048Counts, sudokuCounts } from "@/features/progress/lib/streak";

/**
 * The activity saved on this device, for streaks: practice answers and the finished games of every kind, whether the
 * store is a guest's or a signed-in user's offline copy. Nothing here counts opening a page or a game: only records
 * of finished work exist to be read.
 */

/** When (epoch ms) each qualifying activity in this store happened. */
export function localActivityTimes(store: LocalStore): number[] {
  const times: number[] = [];
  for (const session of loadGuestData(store.key).sessions) {
    for (const attempt of session.attempts) if (countsAsAnswer(attempt.outcome)) times.push(attempt.at);
  }
  for (const session of mindsprintHistory.load(store)) times.push(session.endedAt);
  for (const session of recallHistory.load(store)) times.push(session.endedAt);
  for (const session of sudokuHistory.load(store)) if (sudokuCounts(session)) times.push(session.endedAt);
  for (const session of game2048History.load(store)) if (game2048Counts(session)) times.push(session.endedAt);
  return times;
}

/**
 * The days of the activity on this device in `timeZone`. For a signed-in user this is added to the days the server
 * knows (pass the user's own time zone, which the server used too, so a day is the same day on both sides).
 */
export function localActivityDays(store: LocalStore, timeZone: string): Set<string> {
  return activityDayKeys(localActivityTimes(store), timeZone);
}

/**
 * Every day a guest was active: the record kept as they play, completed once with the sessions saved before the
 * record existed (see `backfillActivityDays`).
 */
export function guestActivityDays(store: LocalStore): string[] {
  return backfillActivityDays(store, () => localActivityDays(store, browserTimeZone()));
}
