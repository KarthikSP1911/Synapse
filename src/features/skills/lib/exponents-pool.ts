import { EXERCISE_TYPES, EXPONENT_LEVELS, EXPONENT_MODES, type Difficulty, type ExponentLevel, type ExponentMode, type PracticeConfig } from "./types";
import {
  EXPONENT_BASE_MAX,
  EXPONENT_BASE_MIN,
  EXPONENT_LIMIT,
  EXPONENT_RESULT_MAX,
  EXPONENT_RESULT_MIN,
  exponentCore,
  fitsResult,
  variantsFor,
  type ExponentSpec,
  type ExponentType,
} from "./exponents";
import { seededRandom } from "./sampling";

/**
 * The configuration side of Exponents: what each difficulty level switches on, which exercise types an answer mode
 * can offer, and the deterministic pool of questions a configuration can ask.
 */

export type ExponentsConfig = Extract<PracticeConfig, { skill: "exponents" }>;

/** The options a level presets; the answer mode stays whatever the player chose. */
export type ExponentOptions = Pick<
  ExponentsConfig,
  "baseMin" | "baseMax" | "expMin" | "expMax" | "allowPositive" | "allowZero" | "allowNegative" | "negativeBases" | "maxResult"
>;

const ALL_TYPES = EXERCISE_TYPES.exponents as readonly ExponentType[];

/**
 * Easy: small positive bases and positive exponents, direct evaluation and the basic product and quotient laws.
 * Medium: bigger exponents, missing bases and exponents, power of a power and the zero exponent.
 * Hard: negative exponents and bases, mixed laws, brackets and multi-step simplifying.
 */
export const EXPONENT_PRESETS: Record<"easy" | "medium" | "hard", ExponentOptions & { exerciseTypes: ExponentType[] }> = {
  easy: {
    exerciseTypes: ["evaluate", "mul-law", "div-law"],
    baseMin: 2,
    baseMax: 5,
    expMin: 1,
    expMax: 6,
    allowPositive: true,
    allowZero: false,
    allowNegative: false,
    negativeBases: false,
    maxResult: 10_000,
  },
  medium: {
    exerciseTypes: ["evaluate", "base", "exponent", "mul-law", "div-law", "power-law", "zero-negative"],
    baseMin: 2,
    baseMax: 10,
    expMin: 0,
    expMax: 8,
    allowPositive: true,
    allowZero: true,
    allowNegative: false,
    negativeBases: false,
    maxResult: 100_000,
  },
  hard: {
    exerciseTypes: [...ALL_TYPES],
    baseMin: 2,
    baseMax: 10,
    expMin: -6,
    expMax: 8,
    allowPositive: true,
    allowZero: true,
    allowNegative: true,
    negativeBases: true,
    maxResult: 100_000,
  },
};

export const LEVEL_FOR_DIFFICULTY: Record<Difficulty, "easy" | "medium" | "hard"> = {
  beginner: "easy",
  intermediate: "medium",
  advanced: "hard",
};

type Kinds = Pick<ExponentsConfig, "allowPositive" | "allowZero" | "allowNegative">;

/** Why an exercise type cannot be asked with these options, or null when it can. */
export function typeBlockReason(type: ExponentType, answerMode: ExponentMode, kinds: Kinds): string | null {
  switch (type) {
    case "evaluate":
      if (answerMode === "power") return "Final Value mode only: a single power has no exponent law to simplify.";
      return kinds.allowPositive ? null : "Needs positive exponents.";
    case "base":
      return answerMode === "value" && !kinds.allowPositive ? "Needs positive exponents." : null;
    case "zero-negative":
      return kinds.allowZero || kinds.allowNegative ? null : "Turn on zero or negative exponents to use this.";
    default:
      return null;
  }
}

/** The exercise types an answer mode and exponent kinds can offer, in their usual order. */
export function availableTypes(answerMode: ExponentMode, kinds: Kinds): ExponentType[] {
  return ALL_TYPES.filter((type) => typeBlockReason(type, answerMode, kinds) === null);
}

/** A level's options and exercise types for an answer mode (types the mode cannot ask are left out). */
export function presetFor(level: "easy" | "medium" | "hard", answerMode: ExponentMode): ExponentOptions & { exerciseTypes: ExponentType[] } {
  const preset = EXPONENT_PRESETS[level];
  const available = availableTypes(answerMode, preset);
  return { ...preset, exerciseTypes: preset.exerciseTypes.filter((type) => available.includes(type)) };
}

/** The exponents a configuration may write: its range, narrowed to the kinds that are switched on. */
export function allowedExponents(c: Pick<ExponentsConfig, "expMin" | "expMax"> & Kinds): number[] {
  const out: number[] = [];
  for (let e = c.expMin; e <= c.expMax; e += 1) {
    if ((e > 0 && c.allowPositive) || (e === 0 && c.allowZero) || (e < 0 && c.allowNegative)) out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ExponentsConfigResult = { ok: true; config: ExponentsConfig } | { ok: false; error: string };

const fail = (error: string): ExponentsConfigResult => ({ ok: false, error });
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Validates and canonicalises an untrusted Exponents configuration. */
export function parseExponentsConfig(c: Record<string, unknown>): ExponentsConfigResult {
  if (!EXPONENT_LEVELS.includes(c.level as ExponentLevel)) return fail(`level must be one of ${EXPONENT_LEVELS.join(", ")}`);
  if (!EXPONENT_MODES.includes(c.answerMode as ExponentMode)) return fail(`answerMode must be one of ${EXPONENT_MODES.join(", ")}`);
  const level = c.level as ExponentLevel;
  const answerMode = c.answerMode as ExponentMode;

  if (!isInt(c.baseMin, EXPONENT_BASE_MIN, EXPONENT_BASE_MAX) || !isInt(c.baseMax, EXPONENT_BASE_MIN, EXPONENT_BASE_MAX) || c.baseMin > c.baseMax) {
    return fail(`Base range must be within ${EXPONENT_BASE_MIN}-${EXPONENT_BASE_MAX}, lowest first`);
  }
  if (!isInt(c.expMin, -EXPONENT_LIMIT, EXPONENT_LIMIT) || !isInt(c.expMax, -EXPONENT_LIMIT, EXPONENT_LIMIT) || c.expMin > c.expMax) {
    return fail(`Exponent range must be within ${-EXPONENT_LIMIT} to ${EXPONENT_LIMIT}, lowest first`);
  }
  const { allowPositive, allowZero, allowNegative, negativeBases } = c;
  if (typeof allowPositive !== "boolean" || typeof allowZero !== "boolean" || typeof allowNegative !== "boolean" || typeof negativeBases !== "boolean") {
    return fail("allowPositive, allowZero, allowNegative and negativeBases must be true or false");
  }
  if (!allowPositive && !allowZero && !allowNegative) return fail("Allow at least one kind of exponent");
  if (!isInt(c.maxResult, EXPONENT_RESULT_MIN, EXPONENT_RESULT_MAX)) {
    return fail(`Maximum result must be within ${EXPONENT_RESULT_MIN}-${EXPONENT_RESULT_MAX}`);
  }

  if (!Array.isArray(c.exerciseTypes) || c.exerciseTypes.length === 0 || !c.exerciseTypes.every((t) => ALL_TYPES.includes(t as ExponentType))) {
    return fail(`exerciseTypes must be a non-empty list of: ${ALL_TYPES.join(", ")}`);
  }
  const kinds = { allowPositive, allowZero, allowNegative };
  const exerciseTypes = ALL_TYPES.filter((t) => (c.exerciseTypes as string[]).includes(t) && typeBlockReason(t, answerMode, kinds) === null);
  if (exerciseTypes.length === 0) return fail("None of the chosen exercise types can be asked with these options");

  const config: ExponentsConfig = {
    skill: "exponents",
    exerciseTypes,
    level,
    answerMode,
    baseMin: c.baseMin,
    baseMax: c.baseMax,
    expMin: c.expMin,
    expMax: c.expMax,
    allowPositive,
    allowZero,
    allowNegative,
    negativeBases,
    maxResult: c.maxResult,
  };
  return allowedExponents(config).length === 0 ? fail("No exponent in that range is allowed by the kinds you switched on") : { ok: true, config };
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

/** Most questions one exercise type contributes; the rest of a bigger space is a fixed, evenly spread sample. */
const GROUP_CAP = 160;
/** Spaces up to this size are searched exhaustively (in a fixed shuffled order); bigger ones are sampled. */
const ENUMERATE_LIMIT = 120_000;

/** The exponents a variant may use: a few shapes only make sense for part of the allowed range. */
function exponentChoices(type: ExponentType, variant: string, allowed: number[]): number[] {
  if (type === "evaluate") return allowed.filter((e) => e >= 2);
  if (type === "base" && variant === "direct") return allowed.filter((e) => e >= 2);
  if (type === "zero-negative" && variant === "direct") return allowed.filter((e) => e <= 0);
  if (type === "zero-negative" && variant === "recip") return allowed.filter((e) => e !== 0);
  return allowed;
}

/** Up to `cap` indices in [0, total) that pass `accept`, always the same ones for the same `random`. */
function pickAccepted(total: number, cap: number, random: () => number, accept: (index: number) => boolean): number[] {
  const out: number[] = [];
  if (total <= ENUMERATE_LIMIT) {
    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const index of order) {
      if (accept(index)) out.push(index);
      if (out.length >= cap) break;
    }
    return out;
  }
  const seen = new Set<number>();
  for (let attempts = cap * 200; out.length < cap && attempts > 0; attempts -= 1) {
    const index = Math.floor(random() * total);
    if (seen.has(index)) continue;
    seen.add(index);
    if (accept(index)) out.push(index);
  }
  return out;
}

/** The bases a configuration may use: sizes baseMin to baseMax, plus their negatives when allowed. */
export function exponentBases(c: Pick<ExponentsConfig, "baseMin" | "baseMax" | "negativeBases">): number[] {
  const sizes: number[] = [];
  for (let b = c.baseMin; b <= c.baseMax; b += 1) sizes.push(b);
  return c.negativeBases ? [...sizes, ...sizes.map((b) => -b)] : sizes;
}

/** Candidate questions per exercise type for the types the configuration has switched on. */
export function exponentSpecs(config: ExponentsConfig): Array<{ type: ExponentType; specs: ExponentSpec[] }> {
  const allowed = allowedExponents(config);
  const bases = exponentBases(config);
  const kindAllowed = (e: number) => (e > 0 && config.allowPositive) || (e === 0 && config.allowZero) || (e < 0 && config.allowNegative);
  // The pool depends on what is asked, not on which other types happen to be on or on the level's name.
  const seed = JSON.stringify({ ...config, exerciseTypes: undefined, level: undefined });
  const out: Array<{ type: ExponentType; specs: ExponentSpec[] }> = [];

  for (const type of config.exerciseTypes) {
    const plans = variantsFor(type, config.answerMode);
    const perPlan = Math.ceil(GROUP_CAP / Math.max(1, plans.length));
    const specs: ExponentSpec[] = [];
    for (const { variant, exps } of plans) {
      const choices = exponentChoices(type, variant, allowed);
      if (choices.length === 0 || bases.length === 0) continue;
      const total = bases.length * choices.length ** exps;
      const specAt = (index: number): ExponentSpec => {
        const args = [bases[index % bases.length]];
        let rest = Math.floor(index / bases.length);
        for (let k = 0; k < exps; k += 1) {
          args.push(choices[rest % choices.length]);
          rest = Math.floor(rest / choices.length);
        }
        return { skill: "exponents", exerciseType: type, mode: config.answerMode, variant, args };
      };
      const accept = (index: number): boolean => {
        const core = exponentCore(specAt(index));
        if (!core) return false;
        // Every exponent the question shows or asks for has to be of a kind the player allowed.
        if (!core.exponents.every(kindAllowed)) return false;
        return core.value === null || fitsResult(core.value, config.maxResult);
      };
      for (const index of pickAccepted(total, perPlan, seededRandom(`${seed}:${type}:${variant}`), accept)) specs.push(specAt(index));
    }
    out.push({ type, specs });
  }
  return out;
}
