/**
 * Number Recall: a sequence of digits (or digit pairs) flashes one item at a time, then the player types the whole
 * sequence back in the original order.
 *
 * Every item is a STRING, never a number: "07" must stay "07" through display, input, checking and storage, and
 * "00" is a perfectly good item. Nothing in this module converts an item to a number.
 */

export const RECALL_MODES = ["single", "pair"] as const;
export type RecallMode = (typeof RECALL_MODES)[number];

/** How many digits make up one item. */
export const DIGITS_PER_ITEM: Record<RecallMode, number> = { single: 1, pair: 2 };

export const MODE_LABEL: Record<RecallMode, string> = { single: "Single digits", pair: "Two-digit numbers" };
export const MODE_EXAMPLE: Record<RecallMode, string> = { single: "7 → 2 → 9 → 4 → 1", pair: "07 → 54 → 00 → 36 → 92" };
/** What one item is called in the interface, singular and plural. */
export const ITEM_NAME: Record<RecallMode, [string, string]> = { single: ["digit", "digits"], pair: ["number", "numbers"] };

export const DIFFICULTIES = ["easy", "medium", "hard", "custom"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const LIMITS = {
  rounds: { min: 1, max: 20 },
  /** Items per sequence: individual digits in single mode, digit pairs in pair mode. */
  length: { min: 2, max: 30 },
  displayMs: { min: 200, max: 3000, step: 100 },
  /** At least a beat of blank screen, so two equal items in a row still read as two. */
  gapMs: { min: 100, max: 2000, step: 100 },
  /** Seconds counted down before each round. */
  countdown: { min: 1, max: 10 },
} as const;

export interface RecallConfig {
  mode: RecallMode;
  rounds: number;
  /** Items in the first (or, without progression, every) round's sequence. */
  length: number;
  displayMs: number;
  gapMs: number;
  countdown: number;
  difficulty: Difficulty;
  /** Each perfect recall makes the next sequence one item longer. */
  progressive: boolean;
  /** A sequence that is not perfect still earns points for each item recalled in the right place. */
  partialCredit: boolean;
}

/** A round as it was played. */
export interface PlayedRound {
  /** The sequence that was shown, as strings. */
  sequence: string[];
  /** What the player entered, one string per item; null when the round was skipped. */
  answer: string[] | null;
  /** From the entry boxes appearing to Submit. */
  responseMs: number;
}

/** What is saved for a finished session. Correctness and points are derived from it, never stored separately. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  config: RecallConfig;
  rounds: PlayedRound[];
}
