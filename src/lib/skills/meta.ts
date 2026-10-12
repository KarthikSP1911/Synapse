import type { Difficulty, ExerciseType, Skill } from "./types";

/** Display text for skills and exercise types. No React here, so server and client share it. */

export interface SkillMeta {
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
};

export interface ExerciseMeta {
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
};

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

export const SKILL_ORDER: readonly Skill[] = ["multiplication", "addition", "subtraction", "division", "percentage", "fraction", "square"];

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
