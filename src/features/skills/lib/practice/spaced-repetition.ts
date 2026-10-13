import type { Outcome } from "@/features/skills/lib/types";

/**
 * Leitner boxes 1-5; an item in box N is reviewed again after REVIEW_INTERVAL_DAYS[N - 1] days.
 * One implementation serves every skill: items are identified by their stable question id.
 */
export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;
export const MAX_BOX = REVIEW_INTERVAL_DAYS.length;
/** New learning items start here. */
export const NEW_ITEM_BOX = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A correct answer moves an item up one box; a wrong answer sends it back to box 1. */
export function nextBox(currentBox: number, isCorrect: boolean): number {
  return isCorrect ? Math.min(currentBox + 1, MAX_BOX) : 1;
}

export interface AttemptResult {
  outcome: Outcome;
  /** The user asked for a hint before answering. */
  hinted: boolean;
}

/**
 * Box after an attempt:
 *  - unassisted correct recall advances one box (box 5 stays in box 5 and is simply re-tested in 16 days);
 *  - a correct answer that used a hint holds its box, because it was not fully unassisted recall;
 *  - incorrect, skipped and timed-out attempts return to box 1.
 */
export function nextBoxForAttempt(currentBox: number, attempt: AttemptResult): number {
  if (attempt.outcome !== "correct") return NEW_ITEM_BOX;
  const box = Math.min(Math.max(currentBox, NEW_ITEM_BOX), MAX_BOX);
  return attempt.hinted ? box : nextBox(box, true);
}

export function dueDateForBox(box: number, now: Date = new Date()): Date {
  const days = REVIEW_INTERVAL_DAYS[Math.min(Math.max(box, 1), MAX_BOX) - 1];
  return new Date(now.getTime() + days * DAY_MS);
}

/** An item that was attempted is due once its review date has passed; no date counts as due. */
export function isDue(dueAt: Date | null, now: Date = new Date()): boolean {
  return dueAt === null || dueAt.getTime() <= now.getTime();
}
