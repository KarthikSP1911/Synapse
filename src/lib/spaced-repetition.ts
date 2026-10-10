/** Leitner boxes 1-5; a pair in box N is reviewed again after REVIEW_INTERVAL_DAYS[N - 1] days. */
export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;
export const MAX_BOX = REVIEW_INTERVAL_DAYS.length;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A correct answer moves a pair up one box; a wrong answer sends it back to box 1. */
export function nextBox(currentBox: number, isCorrect: boolean): number {
  return isCorrect ? Math.min(currentBox + 1, MAX_BOX) : 1;
}

export function dueDateForBox(box: number, now: Date = new Date()): Date {
  const days = REVIEW_INTERVAL_DAYS[Math.min(Math.max(box, 1), MAX_BOX) - 1];
  return new Date(now.getTime() + days * DAY_MS);
}
