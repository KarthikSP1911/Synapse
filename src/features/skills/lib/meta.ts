import type { Difficulty, ExerciseType, ExponentLevel, ExponentMode, Skill } from "./types";

/** Display text for skills and exercise types. No React here, so server and client share it. */

interface SkillMeta {
  title: string;
  short: string;
  description: string;
}

export const SKILL_META: Record<Skill, SkillMeta> = {
  multiplication: {
    title: "Multiplication",
    short: "Times tables",
    description: "Drill the times tables, 1 to 20, on the numbers you choose.",
  },
  addition: {
    title: "Addition",
    short: "Addition",
    description: "Add numbers of one to four digits, in the sizes you choose.",
  },
  subtraction: {
    title: "Subtraction",
    short: "Subtraction",
    description: "Subtract numbers of one to four digits, with negative answers if you like.",
  },
  division: {
    title: "Division",
    short: "Division",
    description: "Divide whole numbers, with whole or decimal answers.",
  },
  percentage: {
    title: "Percentages",
    short: "Percentages",
    description: "Percent of a number, increases and decreases, and conversions.",
  },
  fraction: {
    title: "Fractions",
    short: "Fractions",
    description: "Simplify, find a fraction of a number, compare and convert.",
  },
  square: {
    title: "Squares",
    short: "Squares",
    description: "Recall squares and square roots up to 100.",
  },
  exponents: {
    title: "Exponents",
    short: "Exponents",
    description: "Powers and the laws of exponents, as an exponent or a final value.",
  },
};

interface ExerciseMeta {
  label: string;
  description: string;
}

/** Keyed by skill, because "of" and "convert" exist in more than one skill. */
export const EXERCISE_META: { [S in Skill]: Record<string, ExerciseMeta> } = {
  multiplication: {
    multiply: { label: "Multiplication", description: "a × b" },
  },
  addition: {
    add: { label: "Addition", description: "a + b" },
  },
  subtraction: {
    subtract: { label: "Subtraction", description: "a − b" },
  },
  division: {
    divide: { label: "Division", description: "a ÷ b" },
  },
  percentage: {
    of: { label: "Percent of a number", description: "What is 25% of 80?" },
    what: { label: "What percentage?", description: "15 is what percentage of 60?" },
    change: { label: "Increase & decrease", description: "Increase 200 by 15%" },
    convert: { label: "Conversions", description: "0.75 ↔ 75% ↔ 3/4" },
  },
  fraction: {
    simplify: { label: "Simplify", description: "12/16 → 3/4" },
    of: { label: "Fraction of a number", description: "What is 3/4 of 80?" },
    compare: { label: "Compare", description: "Which is larger: 3/4 or 2/3?" },
    convert: { label: "Conversions", description: "1/4 ↔ 0.25 ↔ 25%" },
  },
  square: {
    value: { label: "Find the square", description: "17² = ?" },
    root: { label: "Find the root", description: "√289 = ?" },
    missing: { label: "Missing value", description: "14 × 14 = ?   ?² = 441" },
  },
  exponents: {
    evaluate: { label: "Evaluate powers", description: "2^5 = ?" },
    base: { label: "Find the base", description: "?^3 = 125" },
    exponent: { label: "Find the exponent", description: "2^? = 32" },
    "mul-law": { label: "Multiplication law", description: "2^3 × 2^4 = ?" },
    "div-law": { label: "Division law", description: "3^5 ÷ 3^2 = ?" },
    "power-law": { label: "Power of a power", description: "(2^3)^2 = ?" },
    "zero-negative": { label: "Zero & negative exponents", description: "5^0 = ?   2^-3 = ?" },
    simplify: { label: "Simplify expressions", description: "2^3 × 2^4 ÷ 2^2 = ?" },
  },
};

export const EXPONENT_LEVEL_META: Record<ExponentLevel, { label: string; description: string }> = {
  easy: { label: "Easy", description: "Small positive bases and exponents: direct evaluation and the basic multiplication and division laws." },
  medium: { label: "Medium", description: "Larger exponents, missing bases and exponents, power of a power and the zero exponent." },
  hard: { label: "Hard", description: "Negative exponents and bases, mixed laws, brackets and multi-step simplifying." },
  custom: { label: "Custom", description: "Your own ranges, exercise types and answer mode. Changing any option below switches to Custom." },
};

export const EXPONENT_MODE_META: Record<ExponentMode, { label: string; example: string; description: string }> = {
  power: {
    label: "Power form",
    example: "2^5 × 2^7 = 2^?",
    description: "Apply the laws and give the missing exponent (or base) without working out the big number.",
  },
  value: {
    label: "Final value",
    example: "2^5 × 2^7 = ?",
    description: "Work the whole thing out and give the number. Negative exponents give decimals or fractions, like 0.125 or 1/8.",
  },
};

/** What a question of each exercise type looks like in each answer mode (empty where the mode cannot ask it). */
export const EXPONENT_EXAMPLES: Record<string, Record<ExponentMode, string>> = {
  evaluate: { power: "", value: "2^5 = ?" },
  base: { power: "?^3 × ?^4 = 5^7", value: "?^3 = 125" },
  exponent: { power: "2^3 × 2^? = 2^7", value: "2^? = 32" },
  "mul-law": { power: "2^3 × 2^4 = 2^?", value: "2^3 × 2^4 = ?" },
  "div-law": { power: "3^5 ÷ 3^2 = 3^?", value: "3^5 ÷ 3^2 = ?" },
  "power-law": { power: "(2^3)^2 = 2^?", value: "(2^3)^2 = ?" },
  "zero-negative": { power: "10^-2 × 10^5 = 10^?", value: "5^0 = ?   2^-3 = ?" },
  simplify: { power: "2^3 × 2^4 ÷ 2^2 = 2^?", value: "2^3 × 2^4 ÷ 2^2 = ?" },
};

const EXPONENT_CONCEPTS: Record<string, string> = {
  "law:product": "Product law",
  "law:quotient": "Quotient law",
  "law:power": "Power of a power",
  "zero-negative": "Zero & negative exponents",
  simplify: "Multi-step simplifying",
};

/** `powers-of:2` -> "Powers of 2", `law:product` -> "Product law": the idea an Exponents question practises. */
export function exponentConceptLabel(tail: string): string {
  return tail.startsWith("powers-of:") ? `Powers of ${tail.slice("powers-of:".length)}` : (EXPONENT_CONCEPTS[tail] ?? tail);
}

export function exerciseLabel(skill: Skill, type: ExerciseType | string): string {
  return EXERCISE_META[skill][type]?.label ?? type;
}

export const DIFFICULTY_META: Record<Difficulty, { label: string; description: Record<"percentage" | "fraction", string> }> = {
  beginner: {
    label: "Beginner",
    description: {
      percentage: "Common percentages: 1%, 5%, 10%, 20%, 25%, 50%, 75%.",
      fraction: "Small, familiar denominators and clean results.",
    },
  },
  intermediate: {
    label: "Intermediate",
    description: {
      percentage: "Less common whole-number percentages and larger values.",
      fraction: "Denominators up to 12 and trickier simplifying.",
    },
  },
  advanced: {
    label: "Advanced",
    description: {
      percentage: "Decimal percentages, percentages over 100 and multi-step changes.",
      fraction: "Larger denominators, improper fractions and decimal results.",
    },
  },
};

/** The order skills are listed in on the hub, progress and profile pages: the four operations first, then the rest. */
export const SKILL_ORDER: readonly Skill[] = ["addition", "subtraction", "multiplication", "division", "percentage", "fraction", "square", "exponents"];

export const skillTitle = (skill: string): string => SKILL_META[skill as Skill]?.title ?? skill;

/** Compact label for a session's mode, shared by the summary and progress pages. */
export function modeLabel(session: { mode: string; durationSeconds: number | null; targetQuestionCount: number | null }): string {
  switch (session.mode) {
    case "timed":
      return `Timed · ${session.durationSeconds}s`;
    case "review":
      return `Review · ${session.targetQuestionCount} missed`;
    case "fixed":
      return `${session.targetQuestionCount} questions`;
    default:
      return "Endless";
  }
}
