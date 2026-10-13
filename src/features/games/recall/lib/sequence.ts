import { seededRng, type Rng } from "@/features/games/mindsprint/lib/generate";
import { DIGITS_PER_ITEM, LIMITS, type RecallConfig, type RecallMode } from "./types";

export { seededRng, type Rng };

/** Matches one item of the mode: exactly one digit in single mode, exactly two (leading zero included) in pair mode. */
export const isItem = (mode: RecallMode, value: unknown): value is string => typeof value === "string" && new RegExp(`^\\d{${DIGITS_PER_ITEM[mode]}}$`).test(value);

/** One random item. Every value is possible: 0-9 in single mode, 00-99 in pair mode, always as text of the full width. */
export function randomItem(mode: RecallMode, rng: Rng): string {
  const width = DIGITS_PER_ITEM[mode];
  return String(Math.floor(rng() * 10 ** width)).padStart(width, "0");
}

/** A random sequence of `length` items. Called once per round: the result is what is shown and what the answer is checked against. */
export function generateSequence(mode: RecallMode, length: number, rng: Rng = Math.random): string[] {
  if (!Number.isInteger(length) || length < 1) throw new RangeError("A sequence needs at least one item.");
  return Array.from({ length }, () => randomItem(mode, rng));
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

/**
 * How long the next sequence is. Without progression every round is `config.length`. With it, the first round is
 * `config.length`, each perfect recall adds one item to the next round, and a miss repeats the same length, so
 * the sequence settles at what the player can hold. It never exceeds the maximum.
 */
export function nextLength(config: Pick<RecallConfig, "length" | "progressive">, previous: { length: number; perfect: boolean } | null): number {
  if (!config.progressive || previous === null) return config.length;
  return previous.perfect ? Math.min(LIMITS.length.max, previous.length + 1) : previous.length;
}
