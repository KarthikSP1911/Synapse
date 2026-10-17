import { MAX_DIGITS, MAX_DIVISOR_DIGITS, DIFFICULTIES, EXERCISE_TYPES, FOCUSES, type Difficulty, type Focus, type Skill } from "@/features/skills/lib/types";
import { loadExponentsSetup, saveExponentsSetup, type SetupState } from "@/features/skills/lib/practice/setup-state";

/**
 * The options each skill page was last left with, kept on this device so the page opens the way it was left. Every field is checked
 * on its own, so a damaged or out-of-date value falls back to the default for that field and the rest are kept. Exponents has
 * its own, older store (`setup-state.ts`) and is handled there.
 */

const setupKey = (skill: Skill) => `mathz:setup:${skill}`;
const focusKey = (skill: Skill) => `mathz:focus:${skill}`;

type Slot = Record<string, unknown>;

const isObject = (v: unknown): v is Slot => typeof v === "object" && v !== null && !Array.isArray(v);

/** A non-empty list of whole numbers within a range, each once, smallest first; otherwise the fallback. */
function intList(value: unknown, min: number, max: number, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const picked = [...new Set(value.filter((n): n is number => Number.isInteger(n) && n >= min && n <= max))].sort((a, b) => a - b);
  return picked.length > 0 ? picked : fallback;
}

function types(skill: "percentage" | "fraction" | "square", value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const picked = (EXERCISE_TYPES[skill] as readonly string[]).filter((t) => value.includes(t));
  return picked.length > 0 ? picked : fallback;
}

const text = (value: unknown, fallback: string) => (typeof value === "string" && /^\d{1,5}$/.test(value) ? value : fallback);
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const level = (value: unknown, fallback: Difficulty): Difficulty => (DIFFICULTIES.includes(value as Difficulty) ? (value as Difficulty) : fallback);

/** The saved options of one skill read against `fallback` (a fresh page's options). Pure, so it can be tested without a browser. */
export function parseSkillSetup(skill: Exclude<Skill, "exponents">, raw: unknown, fallback: SetupState): SetupState {
  if (!isObject(raw)) return fallback;
  switch (skill) {
    case "multiplication": {
      const f = fallback.multiplication;
      return { ...fallback, multiplication: { left: intList(raw.left, 1, 20, f.left), right: intList(raw.right, 1, 20, f.right) } };
    }
    case "addition": {
      const f = fallback.addition;
      return { ...fallback, addition: { leftDigits: intList(raw.leftDigits, 1, MAX_DIGITS, f.leftDigits), rightDigits: intList(raw.rightDigits, 1, MAX_DIGITS, f.rightDigits) } };
    }
    case "subtraction": {
      const f = fallback.subtraction;
      return {
        ...fallback,
        subtraction: { leftDigits: intList(raw.leftDigits, 1, MAX_DIGITS, f.leftDigits), rightDigits: intList(raw.rightDigits, 1, MAX_DIGITS, f.rightDigits), allowNegative: flag(raw.allowNegative, f.allowNegative) },
      };
    }
    case "division": {
      const f = fallback.division;
      return {
        ...fallback,
        division: { dividendDigits: intList(raw.dividendDigits, 1, MAX_DIGITS, f.dividendDigits), divisorDigits: intList(raw.divisorDigits, 1, MAX_DIVISOR_DIGITS, f.divisorDigits), decimals: flag(raw.decimals, f.decimals) },
      };
    }
    case "percentage": {
      const f = fallback.percentage;
      return { ...fallback, percentage: { exerciseTypes: types("percentage", raw.exerciseTypes, f.exerciseTypes), difficulty: level(raw.difficulty, f.difficulty), baseMin: text(raw.baseMin, f.baseMin), baseMax: text(raw.baseMax, f.baseMax) } };
    }
    case "fraction": {
      const f = fallback.fraction;
      return { ...fallback, fraction: { exerciseTypes: types("fraction", raw.exerciseTypes, f.exerciseTypes), difficulty: level(raw.difficulty, f.difficulty) } };
    }
    case "square": {
      const f = fallback.square;
      return { ...fallback, square: { exerciseTypes: types("square", raw.exerciseTypes, f.exerciseTypes), rangeMin: text(raw.rangeMin, f.rangeMin), rangeMax: text(raw.rangeMax, f.rangeMax) } };
    }
  }
}

/** The options this skill page was last left with, or `fallback`. */
export function loadSkillSetup(skill: Skill, fallback: SetupState): SetupState {
  if (skill === "exponents") return { ...fallback, exponents: loadExponentsSetup(fallback.exponents) };
  try {
    return parseSkillSetup(skill, JSON.parse(localStorage.getItem(setupKey(skill)) ?? "null"), fallback);
  } catch {
    // Storage unavailable or corrupt: fall back to the defaults.
    return fallback;
  }
}

export function saveSkillSetup(skill: Skill, state: SetupState): void {
  if (skill === "exponents") {
    saveExponentsSetup(state.exponents);
    return;
  }
  try {
    localStorage.setItem(setupKey(skill), JSON.stringify(state[skill]));
  } catch {
    // Not being able to remember the options is harmless.
  }
}

export function loadFocus(skill: Skill): Focus {
  try {
    const saved = localStorage.getItem(focusKey(skill));
    return FOCUSES.includes(saved as Focus) ? (saved as Focus) : "adaptive";
  } catch {
    return "adaptive";
  }
}

export function saveFocus(skill: Skill, focus: Focus): void {
  try {
    localStorage.setItem(focusKey(skill), focus);
  } catch {
    // Not being able to remember the focus is harmless.
  }
}
