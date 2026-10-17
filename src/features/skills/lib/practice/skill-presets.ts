import { DEFAULT_BASE_RANGE, SQUARE_PRESETS, buildPool } from "@/features/skills/lib/pools";
import { DIFFICULTY_META, EXPONENT_LEVEL_META } from "@/features/skills/lib/meta";
import { DIFFICULTIES, EXPONENT_LEVELS, type Focus, type PracticeConfig, type Skill } from "@/features/skills/lib/types";
import { chooseExponentsLevel, type SetupState } from "@/features/skills/lib/practice/setup-state";
import { sameValue } from "@/lib/same-value";

/**
 * The quick-start row of each skill page: a handful of ready-made setups for the detailed options under Customize.
 * Choosing one replaces what it covers and leaves the rest alone; `activePreset` says which one the current options amount to,
 * or "custom" when none does.
 */

export interface SkillPreset {
  id: string;
  label: string;
  /** A short second line on the chip. */
  detail?: string;
  /** What it means; listed behind the "?" beside the row's label. */
  description: string;
}

export interface SkillPresetRow {
  /** The row's label: "Difficulty", "Tables", "Size", "Range". */
  label: string;
  presets: SkillPreset[];
  /** Whether the options can drift away from every preset (so a "Custom" choice means something). */
  hasCustom: boolean;
}

const numbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const TABLE_RANGES = [
  { id: "1-5", label: "1–5", from: 1, to: 5 },
  { id: "6-10", label: "6–10", from: 6, to: 10 },
  { id: "11-20", label: "11–20", from: 11, to: 20 },
  { id: "1-20", label: "All", from: 1, to: 20 },
] as const;

interface DigitPreset {
  id: string;
  label: string;
  description: string;
  first: number[];
  second: number[];
}

const ADDITION: DigitPreset[] = [
  { id: "d1", label: "1 digit", description: "Single-digit numbers, like 7 + 5.", first: [1], second: [1] },
  { id: "d2", label: "2 digits", description: "Two-digit numbers, like 47 + 38.", first: [2], second: [2] },
  { id: "d3", label: "3 digits", description: "Three-digit numbers, like 472 + 385.", first: [3], second: [3] },
  { id: "mixed", label: "Mixed", description: "One or two digits on either side.", first: [1, 2], second: [1, 2] },
];

const SUBTRACTION: DigitPreset[] = [
  { id: "d1", label: "1 digit", description: "Single-digit numbers, like 9 − 4.", first: [1], second: [1] },
  { id: "d2", label: "2 digits", description: "Two-digit numbers, like 83 − 47.", first: [2], second: [2] },
  { id: "d3", label: "3 digits", description: "Three-digit numbers, like 832 − 475.", first: [3], second: [3] },
  { id: "mixed", label: "Mixed", description: "A two-digit number take away one or two digits.", first: [2], second: [1, 2] },
];

const DIVISION: DigitPreset[] = [
  { id: "small", label: "Small", description: "A single digit divided by a single digit.", first: [1], second: [1] },
  { id: "standard", label: "Standard", description: "A two-digit number divided by a single digit.", first: [2], second: [1] },
  { id: "large", label: "Large", description: "A three-digit number divided by one or two digits.", first: [3], second: [1, 2] },
];

const EXPONENT_PRESETS: SkillPreset[] = (["easy", "medium", "hard"] as const).map((id) => ({ id, label: EXPONENT_LEVEL_META[id].label, description: EXPONENT_LEVEL_META[id].description }));

const difficultyPresets = (skill: "percentage" | "fraction"): SkillPreset[] => DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_META[d].label, description: DIFFICULTY_META[d].description[skill] }));

export function presetRow(skill: Skill): SkillPresetRow {
  switch (skill) {
    case "multiplication":
      return { label: "Tables", hasCustom: true, presets: TABLE_RANGES.map((r) => ({ id: r.id, label: r.label, description: `Times tables ${r.from === 1 && r.to === 20 ? "1 to 20" : `${r.from} to ${r.to}`} on both sides.` })) };
    case "addition":
      return { label: "Size of numbers", hasCustom: true, presets: ADDITION.map(({ id, label, description }) => ({ id, label, description })) };
    case "subtraction":
      return { label: "Size of numbers", hasCustom: true, presets: SUBTRACTION.map(({ id, label, description }) => ({ id, label, description })) };
    case "division":
      return { label: "Size of numbers", hasCustom: true, presets: DIVISION.map(({ id, label, description }) => ({ id, label, description })) };
    case "percentage":
      return { label: "Difficulty", hasCustom: true, presets: difficultyPresets("percentage") };
    case "fraction":
      return { label: "Difficulty", hasCustom: false, presets: difficultyPresets("fraction") };
    case "square":
      return {
        label: "Range",
        hasCustom: true,
        presets: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_META[d].label, detail: `${SQUARE_PRESETS[d].rangeMin}–${SQUARE_PRESETS[d].rangeMax}`, description: `Numbers from ${SQUARE_PRESETS[d].rangeMin} to ${SQUARE_PRESETS[d].rangeMax}.` })),
      };
    case "exponents":
      return { label: "Difficulty", hasCustom: true, presets: EXPONENT_PRESETS };
  }
}

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n) => b.includes(n));
const digitPresets = (skill: "addition" | "subtraction" | "division") => (skill === "addition" ? ADDITION : skill === "subtraction" ? SUBTRACTION : DIVISION);

/** The preset these options are exactly, or "custom". */
export function activePreset(skill: Skill, state: SetupState): string {
  switch (skill) {
    case "multiplication": {
      const { left, right } = state.multiplication;
      return TABLE_RANGES.find((r) => sameSet(left, numbers(r.from, r.to)) && sameSet(right, numbers(r.from, r.to)))?.id ?? "custom";
    }
    case "addition":
    case "subtraction": {
      const { leftDigits, rightDigits } = state[skill];
      return digitPresets(skill).find((p) => sameSet(leftDigits, p.first) && sameSet(rightDigits, p.second))?.id ?? "custom";
    }
    case "division": {
      const { dividendDigits, divisorDigits } = state.division;
      return DIVISION.find((p) => sameSet(dividendDigits, p.first) && sameSet(divisorDigits, p.second))?.id ?? "custom";
    }
    case "percentage": {
      const { difficulty, baseMin, baseMax } = state.percentage;
      const range = DEFAULT_BASE_RANGE[difficulty];
      return baseMin === String(range.baseMin) && baseMax === String(range.baseMax) ? difficulty : "custom";
    }
    case "fraction":
      return state.fraction.difficulty;
    case "square": {
      const { rangeMin, rangeMax } = state.square;
      return DIFFICULTIES.find((d) => rangeMin === String(SQUARE_PRESETS[d].rangeMin) && rangeMax === String(SQUARE_PRESETS[d].rangeMax)) ?? "custom";
    }
    case "exponents":
      return state.exponents.level;
  }
}

/** The options after choosing a preset. "custom" changes nothing: it only means "let me set them myself". */
export function applyPreset(skill: Skill, state: SetupState, id: string): SetupState {
  if (id === "custom") return state;
  switch (skill) {
    case "multiplication": {
      const range = TABLE_RANGES.find((r) => r.id === id);
      return range ? { ...state, multiplication: { left: numbers(range.from, range.to), right: numbers(range.from, range.to) } } : state;
    }
    case "addition":
    case "subtraction": {
      const preset = digitPresets(skill).find((p) => p.id === id);
      return preset ? { ...state, [skill]: { ...state[skill], leftDigits: [...preset.first], rightDigits: [...preset.second] } } : state;
    }
    case "division": {
      const preset = DIVISION.find((p) => p.id === id);
      return preset ? { ...state, division: { ...state.division, dividendDigits: [...preset.first], divisorDigits: [...preset.second] } } : state;
    }
    case "percentage": {
      const difficulty = DIFFICULTIES.find((d) => d === id);
      if (!difficulty) return state;
      return { ...state, percentage: { ...state.percentage, difficulty, baseMin: String(DEFAULT_BASE_RANGE[difficulty].baseMin), baseMax: String(DEFAULT_BASE_RANGE[difficulty].baseMax) } };
    }
    case "fraction": {
      const difficulty = DIFFICULTIES.find((d) => d === id);
      return difficulty ? { ...state, fraction: { ...state.fraction, difficulty } } : state;
    }
    case "square": {
      const difficulty = DIFFICULTIES.find((d) => d === id);
      if (!difficulty) return state;
      return { ...state, square: { ...state.square, rangeMin: String(SQUARE_PRESETS[difficulty].rangeMin), rangeMax: String(SQUARE_PRESETS[difficulty].rangeMax) } };
    }
    case "exponents": {
      const level = EXPONENT_LEVELS.find((l) => l === id);
      return level ? { ...state, exponents: chooseExponentsLevel(state.exponents, level) } : state;
    }
  }
}

/**
 * Whether Customize should start open: the options are custom, or something outside the preset row (the exercise types, the
 * kinds of answer) is not what a fresh page has.
 */
export function isCustomized(skill: Skill, state: SetupState, defaults: SetupState): boolean {
  if (activePreset(skill, state) === "custom") return true;
  switch (skill) {
    case "percentage":
    case "fraction":
    case "square":
      return !sameValue(state[skill].exerciseTypes, defaults[skill].exerciseTypes);
    case "subtraction":
      return state.subtraction.allowNegative !== defaults.subtraction.allowNegative;
    case "division":
      return state.division.decimals !== defaults.division.decimals;
    case "exponents":
      return state.exponents.answerMode !== defaults.exponents.answerMode;
    default:
      return false;
  }
}

/** How many questions a configuration draws from (pairs, for multiplication). */
export function questionPoolSize(config: PracticeConfig): number {
  return config.skill === "multiplication" ? config.left.length * config.right.length : buildPool(config).length;
}

// ---------------------------------------------------------------------------
// The summary sentence
// ---------------------------------------------------------------------------

const rangeText = (values: readonly number[]): string => {
  if (values.length === 0) return "none";
  const contiguous = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
  return contiguous && values.length > 1 ? `${values[0]}–${values[values.length - 1]}` : values.join(", ");
};

const digitsText = (digits: readonly number[]): string => (digits.length === 1 ? `${digits[0]}-digit` : `${rangeText(digits)}-digit`);

const countText = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What is being practised, in a few words: "1–20 × 1–20", "2-digit + 1–2-digit", "intermediate percentages of 10–500". */
export function describeSkill(skill: Skill, state: SetupState): string {
  switch (skill) {
    case "multiplication":
      return `${rangeText(state.multiplication.left)} × ${rangeText(state.multiplication.right)}`;
    case "addition":
      return `${digitsText(state.addition.leftDigits)} + ${digitsText(state.addition.rightDigits)}`;
    case "subtraction":
      return `${digitsText(state.subtraction.leftDigits)} − ${digitsText(state.subtraction.rightDigits)}${state.subtraction.allowNegative ? ", negatives allowed" : ""}`;
    case "division":
      return `${digitsText(state.division.dividendDigits)} ÷ ${digitsText(state.division.divisorDigits)}${state.division.decimals ? ", decimals allowed" : ", whole answers only"}`;
    case "percentage":
      return `${DIFFICULTY_META[state.percentage.difficulty].label.toLowerCase()} percentages of ${state.percentage.baseMin}–${state.percentage.baseMax} (${countText(state.percentage.exerciseTypes.length, "exercise type")})`;
    case "fraction":
      return `${DIFFICULTY_META[state.fraction.difficulty].label.toLowerCase()} fractions (${countText(state.fraction.exerciseTypes.length, "exercise type")})`;
    case "square":
      return `squares and cubes from ${state.square.rangeMin}–${state.square.rangeMax} (${countText(state.square.exerciseTypes.length, "exercise type")})`;
    case "exponents":
      return `${EXPONENT_LEVEL_META[state.exponents.level].label.toLowerCase()} exponents, ${state.exponents.answerMode === "power" ? "answered as a power" : "answered as a value"}, bases ${state.exponents.baseMin}–${state.exponents.baseMax}`;
  }
}

const FOCUS_TEXT: Record<Focus, string> = { adaptive: "an adaptive mix", weak: "your weak spots", due: "reviews that are due" };

/** The whole setup in one sentence: "20 questions of 1–20 × 1–20, an adaptive mix, from a pool of 400 pairs." */
export function summarizeSkillSetup({ skill, state, session, focus, pool }: { skill: Skill; state: SetupState; session: string; focus: Focus; pool: number }): string {
  const length = session === "endless" ? "An endless session" : session.startsWith("timed:") ? `${Number(session.slice(6)) >= 60 ? `${Number(session.slice(6)) / 60}-minute` : `${session.slice(6)}-second`} challenge` : `${session} questions`;
  const pairs = skill === "multiplication" ? "pairs" : "questions";
  return `${length} on ${describeSkill(skill, state)}, ${FOCUS_TEXT[focus]}, from a pool of ${pool.toLocaleString("en-US")} ${pairs}.`;
}
