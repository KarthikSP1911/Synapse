/**
 * Shared vocabulary for every practice skill.
 *
 * A question is described by a `QuestionSpec` (a discriminated union: just the operands) and
 * its stable id is derived from the spec, so any question can be rebuilt from its id alone.
 * `Question` adds everything computed from a spec: prompt, exact answer, explanation, etc.
 */

import type { Rational } from "./rational";

export const SKILLS = ["multiplication", "addition", "subtraction", "division", "percentage", "fraction", "square", "exponents"] as const;
export type Skill = (typeof SKILLS)[number];

export const isSkill = (value: unknown): value is Skill => SKILLS.includes(value as Skill);

export const EXERCISE_TYPES = {
  multiplication: ["multiply"],
  addition: ["add"],
  subtraction: ["subtract"],
  division: ["divide"],
  percentage: ["of", "what", "change", "convert"],
  fraction: ["simplify", "of", "compare", "convert"],
  square: ["value", "root", "missing"],
  exponents: ["evaluate", "base", "exponent", "mul-law", "div-law", "power-law", "zero-negative", "simplify"],
} as const satisfies Record<Skill, readonly string[]>;

export type ExerciseTypeOf<S extends Skill> = (typeof EXERCISE_TYPES)[S][number];
export type ExerciseType = ExerciseTypeOf<Skill>;

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** What an Exponents answer is: the exponent that completes a power (`2^3 × 2^4 = 2^?`), or the full number (`= 128`). */
export const EXPONENT_MODES = ["power", "value"] as const;
export type ExponentMode = (typeof EXPONENT_MODES)[number];

/** Easy, Medium and Hard apply a preset of the other options; Custom leaves them as they are. */
export const EXPONENT_LEVELS = ["easy", "medium", "hard", "custom"] as const;
export type ExponentLevel = (typeof EXPONENT_LEVELS)[number];

export const SESSION_MODES = ["fixed", "endless", "timed", "review"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

/** How a session picks from its pool: the usual adaptive mix, only weak questions, or only due reviews. */
export const FOCUSES = ["adaptive", "weak", "due"] as const;
export type Focus = (typeof FOCUSES)[number];

/** Result of one attempt. Anything but "correct" counts as a miss and sends the item back to Box 1. */
export const OUTCOMES = ["correct", "incorrect", "skipped", "timed_out"] as const;
export type Outcome = (typeof OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Answer formats
// ---------------------------------------------------------------------------

export type AnswerFormat =
  /** A whole number. Validated exactly like `number`; the format only picks the on-screen keypad. `signed` also accepts a leading minus. */
  | { kind: "integer"; signed?: true }
  /** A decimal or whole number, compared exactly. `percent` makes a trailing % optional, `signed` allows a leading minus and `fractions` also accepts `a/b`. */
  | { kind: "number"; unit?: "percent"; signed?: true; fractions?: true }
  /** `a/b`. With `lowestTerms` only the fully reduced fraction is accepted, otherwise any equivalent one. */
  | { kind: "fraction"; lowestTerms: boolean }
  /** One of `choices`, answered by button. */
  | { kind: "choice" };

export interface Choice {
  /** Value submitted to the server. */
  value: string;
  /** Text shown on the button. */
  label: string;
}

// ---------------------------------------------------------------------------
// Question specs (operands only)
// ---------------------------------------------------------------------------

export type PercentConvertDirection = "d2p" | "p2d" | "p2f" | "f2p";
export type FractionConvertDirection = "f2d" | "f2p" | "d2f" | "p2f";

export type QuestionSpec =
  | { skill: "multiplication"; exerciseType: "multiply"; left: number; right: number }
  | { skill: "addition"; exerciseType: "add"; left: number; right: number }
  /** `right` may be larger than `left`, giving a negative answer. */
  | { skill: "subtraction"; exerciseType: "subtract"; left: number; right: number }
  /** The answer is whole or ends within two decimal places (15 ÷ 4 = 3.75). */
  | { skill: "division"; exerciseType: "divide"; dividend: number; divisor: number }
  | { skill: "percentage"; exerciseType: "of"; percent: number; base: number }
  | { skill: "percentage"; exerciseType: "what"; part: number; whole: number }
  | { skill: "percentage"; exerciseType: "change"; variant: "increase" | "decrease"; base: number; percent: number }
  | { skill: "percentage"; exerciseType: "change"; variant: "find"; from: number; to: number }
  /** `first` and `second` are signed percentages, e.g. +10 then -10. */
  | { skill: "percentage"; exerciseType: "change"; variant: "multi"; base: number; first: number; second: number }
  /** `value` is a decimal ("0.75"), a percentage without the sign ("35") or a fraction ("3/4"), per `direction`. */
  | { skill: "percentage"; exerciseType: "convert"; direction: PercentConvertDirection; value: string }
  | { skill: "fraction"; exerciseType: "simplify"; num: number; den: number }
  | { skill: "fraction"; exerciseType: "of"; num: number; den: number; base: number }
  | { skill: "fraction"; exerciseType: "compare"; variant: "larger" | "relation"; a: string; b: string }
  | { skill: "fraction"; exerciseType: "convert"; direction: FractionConvertDirection; value: string }
  | { skill: "square"; exerciseType: "value"; n: number }
  /** Asks for the root of n². */
  | { skill: "square"; exerciseType: "root"; n: number }
  /** `product`: n × n = ?   `base`: ?² = n² */
  | { skill: "square"; exerciseType: "missing"; variant: "product" | "base"; n: number }
  /** `variant` picks the shape of the expression and `args` are its integers (the base first, then the exponents); see `exponents.ts`. */
  | { skill: "exponents"; exerciseType: ExerciseTypeOf<"exponents">; mode: ExponentMode; variant: string; args: number[] };

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface QuestionDetails {
  /** Stable identifier, e.g. `percentage:of:25:80`. Equal ids are the same learning item. */
  id: string;
  /** The wider idea this question practises, shared by related questions (e.g. `square:17`). */
  concept: string;
  difficulty: Difficulty;
  /** Plain-text question as shown to the user. */
  prompt: string;
  answerFormat: AnswerFormat;
  choices?: Choice[];
  /** Canonical correct answer as shown to the user, e.g. `3/4` or `60%`. */
  answerText: string;
  /** The exact correct answer: a rational for numeric formats, the choice value for `choice`. */
  expected: Rational | string;
  /** Short nudge shown on request. Asking for it makes the attempt "hinted". */
  hint?: string;
  /** Deterministic, rule-based worked explanation. */
  explanation?: string;
}

export type Question = QuestionSpec & QuestionDetails;

/** The question as sent to the browser: no answer, no explanation. */
export interface PublicQuestion {
  id: string;
  skill: Skill;
  exerciseType: ExerciseType;
  difficulty: Difficulty;
  prompt: string;
  answerFormat: AnswerFormat;
  choices?: Choice[];
  hint?: string;
}

// ---------------------------------------------------------------------------
// Practice configuration (what a session may ask)
// ---------------------------------------------------------------------------

/** Digit counts (1-4) an operand may have; the operand ranges are 1-9, 10-99, 100-999 and 1000-9999. */
export const MAX_DIGITS = 4;
/** Divisors stop at three digits: a four-digit divisor leaves almost no dividends that divide cleanly. */
export const MAX_DIVISOR_DIGITS = 3;

export type PracticeConfig =
  | { skill: "multiplication"; exerciseTypes: ExerciseTypeOf<"multiplication">[]; left: number[]; right: number[] }
  | { skill: "addition"; exerciseTypes: ExerciseTypeOf<"addition">[]; leftDigits: number[]; rightDigits: number[] }
  | {
      skill: "subtraction";
      exerciseTypes: ExerciseTypeOf<"subtraction">[];
      leftDigits: number[];
      rightDigits: number[];
      /** Also ask questions whose second number is larger (23 − 58). */
      allowNegative: boolean;
    }
  | {
      skill: "division";
      exerciseTypes: ExerciseTypeOf<"division">[];
      dividendDigits: number[];
      divisorDigits: number[];
      /** Also ask questions with a decimal answer; off keeps whole-number answers only. */
      decimals: boolean;
    }
  | {
      skill: "percentage";
      exerciseTypes: ExerciseTypeOf<"percentage">[];
      difficulty: Difficulty;
      baseMin: number;
      baseMax: number;
    }
  | { skill: "fraction"; exerciseTypes: ExerciseTypeOf<"fraction">[]; difficulty: Difficulty }
  | { skill: "square"; exerciseTypes: ExerciseTypeOf<"square">[]; rangeMin: number; rangeMax: number }
  | {
      skill: "exponents";
      exerciseTypes: ExerciseTypeOf<"exponents">[];
      level: ExponentLevel;
      answerMode: ExponentMode;
      /** Sizes of the base, ignoring sign: 2 to 20. */
      baseMin: number;
      baseMax: number;
      /** Range of the exponents written in a question. */
      expMin: number;
      expMax: number;
      allowPositive: boolean;
      allowZero: boolean;
      allowNegative: boolean;
      /** Also ask with bases like -2 and -5. */
      negativeBases: boolean;
      /** Largest whole number, or numerator / denominator, a final-value answer may have. */
      maxResult: number;
    };

/** Lightweight pool entry: enough to pick and score without building the full question. */
export interface PoolItem {
  id: string;
  exerciseType: ExerciseType;
  concept: string;
}
