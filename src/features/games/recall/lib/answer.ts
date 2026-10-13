import { isItem } from "./sequence";
import { DIGITS_PER_ITEM, type RecallMode } from "./types";

/**
 * Entering and checking an answer. The player fills one box per item, and every box holds exactly one digit
 * (single mode) or exactly two (pair mode). Boxes are text, so "07" stays "07" and is never equal to "7".
 */

/** Keeps only digits, and no more than one item's worth. Used on whatever is typed or pasted into a box. */
export function sanitizeEntry(mode: RecallMode, value: string): string {
  return value.replace(/\D/g, "").slice(0, DIGITS_PER_ITEM[mode]);
}

/**
 * Spreads pasted or typed digits over the boxes, from the first: "0754003692" becomes 07, 54, 00, 36, 92 in pair
 * mode. Anything that is not a digit (spaces, commas, arrows) is ignored, and digits beyond the last box are dropped.
 * A final box may be left part-filled.
 */
export function entriesFromText(mode: RecallMode, text: string, length: number): string[] {
  const digits = text.replace(/\D/g, "").slice(0, length * DIGITS_PER_ITEM[mode]);
  const width = DIGITS_PER_ITEM[mode];
  const entries: string[] = [];
  for (let i = 0; i < digits.length; i += width) entries.push(digits.slice(i, i + width));
  return entries;
}

type EntryCheck = { ok: true; entries: string[] } | { ok: false; reason: string; /** Zero-based boxes that are empty or incomplete. */ incomplete: number[] };

/** Whether the boxes can be submitted: there is one box per item and each holds a complete item. */
export function validateEntries(mode: RecallMode, length: number, entries: readonly string[]): EntryCheck {
  const incomplete: number[] = [];
  for (let i = 0; i < length; i++) if (!isItem(mode, entries[i])) incomplete.push(i);
  if (incomplete.length === 0 && entries.length === length) return { ok: true, entries: [...entries] };
  const width = DIGITS_PER_ITEM[mode];
  const what = width === 1 ? "one digit" : "two digits";
  return {
    ok: false,
    incomplete,
    reason:
      incomplete.length === 0
        ? `Enter exactly ${length} entries.`
        : incomplete.length === 1
          ? `Box ${incomplete[0] + 1} needs ${what}.`
          : `${incomplete.length} boxes still need ${what}.`,
  };
}

interface Comparison {
  /** True at each position where the player entered the right item. */
  positions: boolean[];
  correct: number;
  total: number;
  /** Every position right, in the original order. */
  perfect: boolean;
}

/** Compares an answer with the sequence position by position. Exact text comparison: "07" does not match "7" or "70". */
export function compareSequences(sequence: readonly string[], answer: readonly string[] | null): Comparison {
  const positions = sequence.map((item, i) => answer !== null && answer[i] === item);
  const correct = positions.filter(Boolean).length;
  return { positions, correct, total: sequence.length, perfect: answer !== null && answer.length === sequence.length && correct === sequence.length };
}
