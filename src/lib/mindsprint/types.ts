/**
 * MindSprint: numbers flash on screen one at a time and the player gives the result of applying them in order.
 *
 * Vocabulary shared by the generator, the scorer, the storage and the server check. Numbers are carried as
 * canonical decimal strings ("-12.5", never "12.50" or floats), so a round survives JSON and storage exactly and
 * all arithmetic on it is done with the exact rationals in `src/lib/skills/rational.ts`.
 */

export const OPERATIONS = ["add", "subtract", "multiply", "divide"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OPERATION_SYMBOL: Record<Operation, string> = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
export const OPERATION_LABEL: Record<Operation, string> = { add: "Addition", subtract: "Subtraction", multiply: "Multiplication", divide: "Division" };

export const LIMITS = {
  rounds: { min: 1, max: 20 },
  flashes: { min: 2, max: 15 },
  digits: { min: 1, max: 4 },
  decimalPlaces: { min: 1, max: 3 },
  displayMs: { min: 200, max: 5000, step: 100 },
  /** At least a beat of blank screen, so two equal numbers in a row still read as two flashes. */
  gapMs: { min: 100, max: 3000, step: 100 },
} as const;

/** Settings of one round. */
export interface RoundConfig {
  /** How many numbers flash. */
  flashes: number;
  /** Digits in the whole part of every number (1 = 1 to 9, 2 = 10 to 99 ...). */
  digits: number;
  /** Operations that may join consecutive numbers; at least one. */
  operations: Operation[];
  /** Numbers may be negative; when off, no number, running total or answer is below zero. */
  allowNegative: boolean;
  decimals: boolean;
  /** Most decimal places any number, running total or answer may have; only used when `decimals` is on. */
  decimalPlaces: number;
  /** How long each number stays visible. */
  displayMs: number;
  /** Blank time between one number and the next. */
  gapMs: number;
}

/** One flashed number. The first has no operator; each later one is applied to the running total. */
export interface Flash {
  op: Operation | null;
  value: string;
}

export interface GeneratedRound {
  config: RoundConfig;
  flashes: Flash[];
}

/** A round as it was played: the sequence that was shown and what the player answered. */
export interface PlayedRound {
  config: RoundConfig;
  flashes: Flash[];
  /** What the player typed; null when the round was left unanswered. */
  answer: string | null;
  /** From the answer box appearing to Submit. */
  responseMs: number;
}

/** What is saved for a finished session. Everything else (correctness, points, totals) is derived from it. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  rounds: PlayedRound[];
}
