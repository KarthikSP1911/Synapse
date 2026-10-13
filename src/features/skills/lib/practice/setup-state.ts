import { DEFAULT_BASE_RANGE, MAX_OPERAND, MAX_SQUARE, MIN_OPERAND, SQUARE_PRESETS, parseConfig } from "@/features/skills/lib/pools";
import { MAX_BASE } from "@/features/skills/lib/ids";
import type { Difficulty, ExponentLevel, ExponentMode, PracticeConfig, Skill } from "@/features/skills/lib/types";
import { DIFFICULTIES, EXERCISE_TYPES, EXPONENT_LEVELS, EXPONENT_MODES } from "@/features/skills/lib/types";
import {
  EXPONENT_BASE_MAX,
  EXPONENT_BASE_MIN,
  EXPONENT_LIMIT,
  EXPONENT_RESULT_MAX,
  EXPONENT_RESULT_MIN,
} from "@/features/skills/lib/exponents";
import { LEVEL_FOR_DIFFICULTY, availableTypes, presetFor, type ExponentOptions } from "@/features/skills/lib/exponents-pool";
import type { Settings } from "@/features/settings/lib/settings";

/**
 * What the practice setup screen edits. Numbers that are typed live as strings so a half-typed
 * value is never silently replaced; `configFromState` is what turns them into a real configuration.
 */
export interface SetupState {
  multiplication: { left: number[]; right: number[] };
  addition: { leftDigits: number[]; rightDigits: number[] };
  subtraction: { leftDigits: number[]; rightDigits: number[]; allowNegative: boolean };
  division: { dividendDigits: number[]; divisorDigits: number[]; decimals: boolean };
  percentage: { exerciseTypes: string[]; difficulty: Difficulty; baseMin: string; baseMax: string };
  fraction: { exerciseTypes: string[]; difficulty: Difficulty };
  square: { exerciseTypes: string[]; rangeMin: string; rangeMax: string };
  exponents: ExponentsSetup;
}

/** The Exponents options. Ranges are typed, so they stay strings until `configFromState` reads them. */
export interface ExponentsSetup {
  level: ExponentLevel;
  answerMode: ExponentMode;
  exerciseTypes: string[];
  baseMin: string;
  baseMax: string;
  expMin: string;
  expMax: string;
  allowPositive: boolean;
  allowZero: boolean;
  allowNegative: boolean;
  negativeBases: boolean;
  maxResult: number;
}

const exponentFields = (options: ExponentOptions) => ({
  baseMin: String(options.baseMin),
  baseMax: String(options.baseMax),
  expMin: String(options.expMin),
  expMax: String(options.expMax),
  allowPositive: options.allowPositive,
  allowZero: options.allowZero,
  allowNegative: options.allowNegative,
  negativeBases: options.negativeBases,
  maxResult: options.maxResult,
});

/** A level's options for an answer mode: Easy, Medium and Hard each preset everything but the answer mode. */
export function exponentsForLevel(level: Exclude<ExponentLevel, "custom">, answerMode: ExponentMode): ExponentsSetup {
  const preset = presetFor(level, answerMode);
  return { level, answerMode, exerciseTypes: preset.exerciseTypes, ...exponentFields(preset) };
}

/** Picking a level applies its preset; Custom keeps whatever is set now. */
export function chooseExponentsLevel(state: ExponentsSetup, level: ExponentLevel): ExponentsSetup {
  return level === "custom" ? { ...state, level } : exponentsForLevel(level, state.answerMode);
}

/** Exercise types an answer mode and exponent kinds cannot ask are dropped; if nothing is left, every available type is on. */
function fitTypes(state: ExponentsSetup): ExponentsSetup {
  const available = availableTypes(state.answerMode, state);
  const kept = available.filter((type) => state.exerciseTypes.includes(type));
  return { ...state, exerciseTypes: kept.length > 0 ? kept : available };
}

/** Switching the answer mode keeps the level (re-applying its preset) and drops types the new mode cannot ask. */
export function chooseExponentsMode(state: ExponentsSetup, answerMode: ExponentMode): ExponentsSetup {
  return state.level === "custom" ? fitTypes({ ...state, answerMode }) : exponentsForLevel(state.level, answerMode);
}

/** Any hand-made change to the options turns the level into Custom. */
export function editExponents(state: ExponentsSetup, patch: Partial<Omit<ExponentsSetup, "level" | "answerMode">>): ExponentsSetup {
  return fitTypes({ ...state, ...patch, level: "custom" });
}

const EXPONENTS_KEY = "math-trainer:setup:exponents";

const isFieldText = (v: unknown): v is string => typeof v === "string" && /^-?\d{0,3}$/.test(v);

/** The last Exponents options used on this device, each field checked on its own so a bad one falls back to `fallback`. */
export function loadExponentsSetup(fallback: ExponentsSetup): ExponentsSetup {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPONENTS_KEY) ?? "null") as Record<string, unknown> | null;
    if (!stored || typeof stored !== "object") return fallback;
    const bool = (key: "allowPositive" | "allowZero" | "allowNegative" | "negativeBases") =>
      typeof stored[key] === "boolean" ? (stored[key] as boolean) : fallback[key];
    const text = (key: "baseMin" | "baseMax" | "expMin" | "expMax") => (isFieldText(stored[key]) ? (stored[key] as string) : fallback[key]);
    const types = Array.isArray(stored.exerciseTypes)
      ? (EXERCISE_TYPES.exponents as readonly string[]).filter((t) => (stored.exerciseTypes as unknown[]).includes(t))
      : fallback.exerciseTypes;
    const maxResult = stored.maxResult;
    const loaded: ExponentsSetup = {
      level: EXPONENT_LEVELS.includes(stored.level as ExponentLevel) ? (stored.level as ExponentLevel) : fallback.level,
      answerMode: EXPONENT_MODES.includes(stored.answerMode as ExponentMode) ? (stored.answerMode as ExponentMode) : fallback.answerMode,
      exerciseTypes: types,
      baseMin: text("baseMin"),
      baseMax: text("baseMax"),
      expMin: text("expMin"),
      expMax: text("expMax"),
      allowPositive: bool("allowPositive"),
      allowZero: bool("allowZero"),
      allowNegative: bool("allowNegative"),
      negativeBases: bool("negativeBases"),
      maxResult:
        typeof maxResult === "number" && Number.isInteger(maxResult) && maxResult >= EXPONENT_RESULT_MIN && maxResult <= EXPONENT_RESULT_MAX
          ? maxResult
          : fallback.maxResult,
    };
    return fitTypes(loaded);
  } catch {
    // Storage unavailable or corrupt: fall back to the defaults.
    return fallback;
  }
}

export function saveExponentsSetup(state: ExponentsSetup): void {
  try {
    localStorage.setItem(EXPONENTS_KEY, JSON.stringify(state));
  } catch {
    // Not being able to remember the options is harmless.
  }
}

const allNumbers = Array.from({ length: MAX_OPERAND }, (_, i) => i + MIN_OPERAND);

export function initialSetupState(settings: Settings): SetupState {
  const { difficulty } = settings;
  return {
    multiplication: { left: allNumbers, right: allNumbers },
    addition: { leftDigits: [1, 2], rightDigits: [1, 2] },
    // The first number starts as the longer one, so every default combination can give a non-negative answer.
    subtraction: { leftDigits: [2], rightDigits: [1, 2], allowNegative: false },
    division: { dividendDigits: [2], divisorDigits: [1], decimals: true },
    percentage: {
      exerciseTypes: settings.enabledExercises.percentage,
      difficulty,
      baseMin: String(DEFAULT_BASE_RANGE[difficulty].baseMin),
      baseMax: String(DEFAULT_BASE_RANGE[difficulty].baseMax),
    },
    fraction: { exerciseTypes: settings.enabledExercises.fraction, difficulty },
    square: {
      exerciseTypes: settings.enabledExercises.square,
      rangeMin: String(SQUARE_PRESETS[difficulty].rangeMin),
      rangeMax: String(SQUARE_PRESETS[difficulty].rangeMax),
    },
    exponents: exponentsForLevel(LEVEL_FOR_DIFFICULTY[difficulty], "value"),
  };
}

export type ConfigFromState = { ok: true; config: PracticeConfig } | { ok: false; error: string };

const toInt = (text: string) => (/^\d+$/.test(text) ? Number(text) : NaN);
const toSignedInt = (text: string) => (/^-?\d+$/.test(text) ? Number(text) : NaN);

export function configFromState(skill: Skill, state: SetupState): ConfigFromState {
  switch (skill) {
    case "multiplication":
      if (state.multiplication.left.length === 0 || state.multiplication.right.length === 0) {
        return { ok: false, error: "Select at least one number on each side to begin." };
      }
      return parseConfig({ skill, left: state.multiplication.left, right: state.multiplication.right });
    case "addition":
    case "subtraction": {
      const { leftDigits, rightDigits } = state[skill];
      if (leftDigits.length === 0 || rightDigits.length === 0) return { ok: false, error: "Select at least one digit count for each number to begin." };
      return parseConfig({ skill, ...state[skill] });
    }
    case "division":
      if (state.division.dividendDigits.length === 0 || state.division.divisorDigits.length === 0) {
        return { ok: false, error: "Select at least one digit count for the dividend and the divisor to begin." };
      }
      return parseConfig({ skill, ...state.division });
    case "percentage": {
      const { baseMin, baseMax } = state.percentage;
      const min = toInt(baseMin);
      const max = toInt(baseMax);
      if (!(min >= 1 && max <= MAX_BASE && min <= max)) {
        return { ok: false, error: `Enter a number range between 1 and ${MAX_BASE}, lowest first.` };
      }
      return parseConfig({ skill, ...state.percentage, baseMin: min, baseMax: max });
    }
    case "fraction":
      return parseConfig({ skill, ...state.fraction });
    case "square": {
      const min = toInt(state.square.rangeMin);
      const max = toInt(state.square.rangeMax);
      if (!(min >= 1 && max <= MAX_SQUARE && min <= max)) {
        return { ok: false, error: `Enter a range between 1 and ${MAX_SQUARE}, lowest first.` };
      }
      return parseConfig({ skill, exerciseTypes: state.square.exerciseTypes, rangeMin: min, rangeMax: max });
    }
    case "exponents": {
      const baseMin = toInt(state.exponents.baseMin);
      const baseMax = toInt(state.exponents.baseMax);
      if (!(baseMin >= EXPONENT_BASE_MIN && baseMax <= EXPONENT_BASE_MAX && baseMin <= baseMax)) {
        return { ok: false, error: `Enter a base range between ${EXPONENT_BASE_MIN} and ${EXPONENT_BASE_MAX}, lowest first.` };
      }
      const expMin = toSignedInt(state.exponents.expMin);
      const expMax = toSignedInt(state.exponents.expMax);
      if (!(expMin >= -EXPONENT_LIMIT && expMax <= EXPONENT_LIMIT && expMin <= expMax)) {
        return { ok: false, error: `Enter an exponent range between ${-EXPONENT_LIMIT} and ${EXPONENT_LIMIT}, lowest first.` };
      }
      return parseConfig({ skill, ...state.exponents, baseMin, baseMax, expMin, expMax });
    }
  }
}

export const isDifficulty = (value: string): value is Difficulty => DIFFICULTIES.includes(value as Difficulty);
