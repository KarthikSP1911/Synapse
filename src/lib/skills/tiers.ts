import type { Difficulty, QuestionSpec } from "./types";
import { isInteger, parseDecimal, rat, toPercentNumber, type Rational } from "./rational";
import { parseFraction } from "./ids";

/**
 * Difficulty tiers. A question's difficulty is a pure function of its spec, and the pool builders
 * select by this function, so "beginner practice" can only ever contain beginner questions.
 */

/** Common percentages everyone should know cold. */
export const BEGINNER_PERCENTS = [1, 5, 10, 20, 25, 50, 75] as const;
/** Less common whole-number percentages. */
export const INTERMEDIATE_PERCENTS = [2, 3, 4, 6, 8, 9, 12, 15, 18, 30, 35, 40, 45, 60, 65, 70, 80, 90] as const;
/** Decimal percentages and percentages above 100. */
export const ADVANCED_PERCENTS = [0.5, 1.5, 2.5, 4.5, 7.5, 12.5, 17.5, 22.5, 37.5, 62.5, 87.5, 110, 120, 125, 150, 175, 200] as const;

export const PERCENTS_BY_DIFFICULTY: Record<Difficulty, readonly number[]> = {
  beginner: BEGINNER_PERCENTS,
  intermediate: INTERMEDIATE_PERCENTS,
  advanced: ADVANCED_PERCENTS,
};

export function percentTier(percent: number): Difficulty {
  if ((BEGINNER_PERCENTS as readonly number[]).includes(percent)) return "beginner";
  return Number.isInteger(percent) && percent <= 100 ? "intermediate" : "advanced";
}

/** Tier of a fraction n/d by how familiar its denominator is. */
export function fractionTier(n: number, d: number): Difficulty {
  if (n > d) return "advanced";
  if ([2, 4, 5, 10].includes(d)) return "beginner";
  return d <= 50 ? "intermediate" : "advanced";
}

export function squareTier(n: number): Difficulty {
  return n <= 20 ? "beginner" : n <= 50 ? "intermediate" : "advanced";
}

type Spec<S extends QuestionSpec["skill"]> = Extract<QuestionSpec, { skill: S }>;

/** A rational as a plain percentage number (1/8 -> 12.5). Only used on values that end cleanly. */
export function percentValue(r: Rational): number {
  return Number(toPercentNumber(r) ?? "NaN");
}

function percentageTier(spec: Spec<"percentage">): Difficulty {
  switch (spec.exerciseType) {
    case "of":
      return percentTier(spec.percent);
    case "what":
      return percentTier(percentValue(rat(spec.part, spec.whole)));
    case "convert":
      return percentTier(convertPercent(spec));
    case "change":
      if (spec.variant === "multi") return "advanced";
      if (spec.variant === "find") return percentTier(percentValue(rat(Math.abs(spec.to - spec.from), spec.from)));
      return percentTier(spec.percent);
  }
}

function fractionSkillTier(spec: Spec<"fraction">): Difficulty {
  switch (spec.exerciseType) {
    case "simplify":
      return spec.num > spec.den || spec.den > 60 ? "advanced" : spec.den <= 20 ? "beginner" : "intermediate";
    case "of": {
      const clean = isInteger(rat(spec.num * spec.base, spec.den));
      if (!clean || spec.num > spec.den || spec.den > 12) return "advanced";
      return [2, 3, 4, 5, 10].includes(spec.den) && spec.base <= 100 ? "beginner" : "intermediate";
    }
    case "compare": {
      const widest = Math.max(parseFraction(spec.a)?.d ?? 0, parseFraction(spec.b)?.d ?? 0);
      return widest <= 8 ? "beginner" : widest <= 12 ? "intermediate" : "advanced";
    }
    case "convert": {
      if (spec.direction === "p2f") return percentTier(Number(spec.value));
      if (spec.direction === "d2f") {
        const r = parseDecimal(spec.value);
        return r ? fractionTier(Number(r.n), Number(r.d)) : "advanced";
      }
      const f = parseFraction(spec.value);
      return f ? fractionTier(f.n, f.d) : "advanced";
    }
  }
}

export function difficultyOfSpec(spec: QuestionSpec): Difficulty {
  switch (spec.skill) {
    case "multiplication": {
      const biggest = Math.max(spec.left, spec.right);
      return biggest <= 10 ? "beginner" : biggest <= 15 ? "intermediate" : "advanced";
    }
    case "percentage":
      return percentageTier(spec);
    case "fraction":
      return fractionSkillTier(spec);
    case "square":
      return squareTier(spec.n);
  }
}

/** The percentage a percentage-conversion question is really about. */
export function convertPercent(spec: Extract<Spec<"percentage">, { exerciseType: "convert" }>): number {
  switch (spec.direction) {
    case "d2p":
      return percentValue(parseDecimal(spec.value) ?? rat(0));
    case "p2d":
    case "p2f":
      return Number(spec.value);
    case "f2p": {
      const f = parseFraction(spec.value);
      return f ? percentValue(rat(f.n, f.d)) : 0;
    }
  }
}
