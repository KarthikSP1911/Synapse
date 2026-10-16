import { ADAPT_DOWN_PERCENT, ADAPT_UP_PERCENT, LIMITS, type SessionOutcome } from "./types";

/**
 * Adaptive n. It only ever suggests the n for the next session; n never changes during one.
 *
 * - Accuracy at or above `ADAPT_UP_PERCENT` (80): n + 1, up to the largest n.
 * - Accuracy below `ADAPT_DOWN_PERCENT` (50): n - 1, down to 1.
 * - Otherwise the same n.
 * - A session that ended in Game Over counts as failed whatever its accuracy on the trials played: n - 1.
 *
 * `accuracy` is a percent (0-100), unrounded, so 79.9 is below the line even though it displays as 80.
 */
export function suggestNextN({ n, accuracy, outcome }: { n: number; accuracy: number; outcome: SessionOutcome }): number {
  const down = Math.max(LIMITS.n.min, n - 1);
  if (outcome === "gameover") return down;
  if (accuracy >= ADAPT_UP_PERCENT) return Math.min(LIMITS.n.max, n + 1);
  if (accuracy < ADAPT_DOWN_PERCENT) return down;
  return Math.min(LIMITS.n.max, Math.max(LIMITS.n.min, n));
}

/** Whether a finished session counts towards the best n: completed (no Game Over) with accuracy at or above the line. */
export const setsBestN = ({ outcome, accuracy }: { outcome: SessionOutcome; accuracy: number }): boolean => outcome === "completed" && accuracy >= ADAPT_UP_PERCENT;
