import {
  DIFFICULTIES,
  EXERCISE_TYPES,
  MAX_DIGITS,
  MAX_DIVISOR_DIGITS,
  SKILLS,
  type Difficulty,
  type ExerciseType,
  type PoolItem,
  type PracticeConfig,
  type QuestionSpec,
  type Skill,
} from "./types";
import { MAX_BASE, MAX_CUBE, fmt, idOfSpec, parseQuestionId } from "./ids";
import { buildQuestion } from "./build";
import { PERCENTS_BY_DIFFICULTY, difficultyOfSpec } from "./tiers";
import { MAX_OPERAND, MIN_OPERAND } from "@/lib/validation";
import { seededRandom } from "./sampling";
import { exponentSpecs, parseExponentsConfig } from "./exponents-pool";
import { gcd, rat, toDecimalString, toFractionString, div, fromNumber, PERCENT } from "@/lib/rational";

/**
 * Practice pools: the finite, deterministic set of questions a configuration can ask.
 *
 * Questions come from a fixed pool rather than being randomly invented, so the same question
 * (same id) comes round again and its history (weakness, Leitner box) can accumulate. Each
 * generator enumerates candidates, keeps those whose difficulty tier matches the request and
 * whose id round-trips through the parser (so every question has a sensible, exact answer),
 * and thins large sets with an even deterministic stride.
 */

export { MIN_OPERAND, MAX_OPERAND } from "@/lib/validation";
export const MAX_SQUARE = 100;
export { MAX_CUBE };

/** Default operand range for percentage questions at each difficulty. */
export const DEFAULT_BASE_RANGE: Record<Difficulty, { baseMin: number; baseMax: number }> = {
  beginner: { baseMin: 10, baseMax: 200 },
  intermediate: { baseMin: 10, baseMax: 500 },
  advanced: { baseMin: 10, baseMax: 1000 },
};

/** Square ranges offered as presets (custom ranges within 1-100 are also allowed). */
export const SQUARE_PRESETS: Record<Difficulty, { rangeMin: number; rangeMax: number }> = {
  beginner: { rangeMin: 1, rangeMax: 20 },
  intermediate: { rangeMin: 1, rangeMax: 50 },
  advanced: { rangeMin: 1, rangeMax: 100 },
};

const PER_GROUP_CAP = 60;
const FRACTION_GROUP_CAP = 300;

/** Evenly thins a list to at most `cap` entries, deterministically. */
export function thin<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  for (let i = 0; i < cap; i += 1) out.push(items[Math.floor((i * items.length) / cap)]);
  return out;
}

type Percentage = Extract<QuestionSpec, { skill: "percentage" }>;
type FractionSpec = Extract<QuestionSpec, { skill: "fraction" }>;

const pow10 = (k: number) => 10 ** k;
/** Allowed decimal places in a computed answer. */
const maxDecimals = (difficulty: Difficulty) => (difficulty === "advanced" ? 2 : 0);

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

function percentagePool(type: ExerciseType, difficulty: Difficulty, baseMin: number, baseMax: number): QuestionSpec[] {
  const percents = PERCENTS_BY_DIFFICULTY[difficulty];
  const k = maxDecimals(difficulty);
  const unit = pow10(4 - k); // (percent*100 * base) divisible by this => at most k decimals
  const specs: Percentage[] = [];

  const bases = (rateX100: number, divisor: number): number[] => {
    const out: number[] = [];
    for (let b = baseMin; b <= baseMax; b += 1) if ((rateX100 * b) % divisor === 0) out.push(b);
    return out;
  };

  switch (type) {
    case "of":
      for (const p of percents) {
        for (const base of thin(bases(Math.round(p * 100), unit), PER_GROUP_CAP)) {
          specs.push({ skill: "percentage", exerciseType: "of", percent: p, base });
        }
      }
      break;
    case "what":
      for (const p of percents) {
        for (const whole of thin(bases(Math.round(p * 100), 10000), PER_GROUP_CAP)) {
          const part = (Math.round(p * 100) * whole) / 10000;
          if (part >= 1) specs.push({ skill: "percentage", exerciseType: "what", part, whole });
        }
      }
      break;
    case "change":
      for (const p of percents) {
        const pc = Math.round(p * 100);
        for (const base of thin(bases(10000 + pc, unit), PER_GROUP_CAP / 2)) {
          specs.push({ skill: "percentage", exerciseType: "change", variant: "increase", base, percent: p });
        }
        if (p < 100) {
          for (const base of thin(bases(10000 - pc, unit), PER_GROUP_CAP / 2)) {
            specs.push({ skill: "percentage", exerciseType: "change", variant: "decrease", base, percent: p });
          }
        }
        for (const dir of [1, -1]) {
          if (dir === -1 && p >= 100) continue;
          const factor = 10000 + dir * pc;
          const froms = bases(factor, 10000).filter((f) => (factor * f) / 10000 >= 1);
          for (const from of thin(froms, PER_GROUP_CAP / 4)) {
            specs.push({ skill: "percentage", exerciseType: "change", variant: "find", from, to: (factor * from) / 10000 });
          }
        }
      }
      if (difficulty === "advanced") {
        const steps = [5, 10, 15, 20, 25, 30, 40, 50];
        const multi: Percentage[] = [];
        for (const first of steps.flatMap((s) => [s, -s])) {
          for (const second of steps.flatMap((s) => [s, -s])) {
            for (let base = baseMin; base <= baseMax; base += 1) {
              if ((base * (100 + first) * (100 + second)) % 100 === 0) {
                multi.push({ skill: "percentage", exerciseType: "change", variant: "multi", base, first, second });
              }
            }
          }
        }
        specs.push(...thin(multi, 120));
      }
      break;
    case "convert":
      for (const p of percents) {
        const rate = div(fromNumber(p), PERCENT);
        specs.push({ skill: "percentage", exerciseType: "convert", direction: "d2p", value: toDecimalString(rate) as string });
        specs.push({ skill: "percentage", exerciseType: "convert", direction: "p2d", value: fmt(p) });
        if (p % 100 !== 0) {
          specs.push({ skill: "percentage", exerciseType: "convert", direction: "p2f", value: fmt(p) });
          specs.push({ skill: "percentage", exerciseType: "convert", direction: "f2p", value: toFractionString(rate) });
        }
      }
      break;
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Fractions
// ---------------------------------------------------------------------------

interface Frac {
  n: number;
  d: number;
  s: string;
}

const frac = (n: number, d: number): Frac => ({ n, d, s: `${n}/${d}` });

function fractionPool(type: ExerciseType, difficulty: Difficulty): QuestionSpec[] {
  const specs: FractionSpec[] = [];

  switch (type) {
    case "simplify":
      for (let q = 2; q <= 50; q += 1) {
        for (let p = 1; p < 2 * q; p += 1) {
          if (gcd(p, q) !== 1) continue;
          for (let k = 2; q * k <= 100; k += 1) {
            specs.push({ skill: "fraction", exerciseType: "simplify", num: p * k, den: q * k });
          }
        }
      }
      break;
    case "of":
      for (let q = 2; q <= 20; q += 1) {
        // Improper fractions only for small denominators; 39/20 of a number is not a mental-math question.
        for (let p = 1; p < (q <= 8 ? 2 * q : q); p += 1) {
          if (gcd(p, q) !== 1) continue;
          for (let base = Math.max(10, q); base <= 240; base += 1) {
            // p/q of base has at most two decimals exactly when q divides 100 * base.
            if ((100 * p * base) % q === 0) specs.push({ skill: "fraction", exerciseType: "of", num: p, den: q, base });
          }
        }
      }
      break;
    case "compare": {
      const all: Frac[] = [];
      for (let d = 2; d <= 20; d += 1) for (let n = 1; n < d; n += 1) all.push(frac(n, d));
      const within = (widest: number) => widest >= (difficulty === "beginner" ? 2 : difficulty === "intermediate" ? 9 : 13) &&
        widest <= (difficulty === "beginner" ? 8 : difficulty === "intermediate" ? 12 : 20);
      const maxGap = difficulty === "beginner" ? 1 : difficulty === "intermediate" ? 0.3 : 0.15;
      const unequal: FractionSpec[] = [];
      const equal: FractionSpec[] = [];
      for (const a of all) {
        for (const b of all) {
          if (a.s === b.s || !within(Math.max(a.d, b.d))) continue;
          const same = a.n * b.d === b.n * a.d;
          if (same) {
            equal.push({ skill: "fraction", exerciseType: "compare", variant: "relation", a: a.s, b: b.s });
          } else if (Math.abs(a.n / a.d - b.n / b.d) <= maxGap) {
            if (gcd(a.n, a.d) === 1 && gcd(b.n, b.d) === 1) {
              unequal.push({ skill: "fraction", exerciseType: "compare", variant: "larger", a: a.s, b: b.s });
            }
            unequal.push({ skill: "fraction", exerciseType: "compare", variant: "relation", a: a.s, b: b.s });
          }
        }
      }
      specs.push(...thin(unequal, FRACTION_GROUP_CAP), ...thin(equal, 30));
      break;
    }
    case "convert": {
      const terminating = [2, 4, 5, 8, 10, 16, 20, 25, 32, 40, 50, 64, 80, 100];
      for (const d of terminating) {
        for (let n = 1; n < 2 * d; n += 1) {
          if (gcd(n, d) !== 1) continue;
          const value = toDecimalString(rat(n, d)) as string;
          specs.push({ skill: "fraction", exerciseType: "convert", direction: "f2d", value: `${n}/${d}` });
          specs.push({ skill: "fraction", exerciseType: "convert", direction: "f2p", value: `${n}/${d}` });
          specs.push({ skill: "fraction", exerciseType: "convert", direction: "d2f", value });
        }
      }
      for (const p of PERCENTS_BY_DIFFICULTY[difficulty]) {
        if (p % 100 !== 0) specs.push({ skill: "fraction", exerciseType: "convert", direction: "p2f", value: fmt(p) });
      }
      break;
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Squares and multiplication
// ---------------------------------------------------------------------------

function squarePool(type: ExerciseType, rangeMin: number, rangeMax: number): QuestionSpec[] {
  const specs: QuestionSpec[] = [];
  for (let n = rangeMin; n <= rangeMax; n += 1) {
    if (type === "value") specs.push({ skill: "square", exerciseType: "value", n });
    if (type === "root") specs.push({ skill: "square", exerciseType: "root", n });
    if (type === "missing") {
      specs.push({ skill: "square", exerciseType: "missing", variant: "product", n });
      specs.push({ skill: "square", exerciseType: "missing", variant: "base", n });
    }
    // Cubes stop at MAX_CUBE however wide the range is.
    if (type === "cube" && n <= MAX_CUBE) specs.push({ skill: "square", exerciseType: "cube", n });
    if (type === "cube-root" && n <= MAX_CUBE) specs.push({ skill: "square", exerciseType: "cube-root", n });
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Addition, subtraction and division
// ---------------------------------------------------------------------------

/** Most questions a single digit combination contributes. */
const ARITHMETIC_GROUP_CAP = 120;

/** Smallest and largest number with `digits` digits (one digit is 1-9, so nothing is "add zero"). */
const digitBounds = (digits: number) => ({ min: digits === 1 ? 1 : 10 ** (digits - 1), max: 10 ** digits - 1 });

/**
 * Picks up to `cap` distinct indices in [0, total) that pass `accept`, the same ones every time.
 * Small spaces are shuffled whole so nothing acceptable is missed; large ones are sampled.
 */
function pickIndices(total: number, cap: number, random: () => number, accept: (index: number) => boolean): number[] {
  const out: number[] = [];
  if (total <= cap * 4) {
    const all = Array.from({ length: total }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    for (const index of all) {
      if (accept(index)) out.push(index);
      if (out.length >= cap) break;
    }
    return out;
  }
  const seen = new Set<number>();
  for (let attempts = cap * 40; out.length < cap && attempts > 0; attempts -= 1) {
    const index = Math.floor(random() * total);
    if (seen.has(index)) continue;
    seen.add(index);
    if (accept(index)) out.push(index);
  }
  return out;
}

/** Addition and subtraction: operand pairs for every chosen combination of digit counts. */
function additivePool(
  skill: "addition" | "subtraction",
  leftDigits: number[],
  rightDigits: number[],
  allowNegative: boolean
): QuestionSpec[] {
  const specs: QuestionSpec[] = [];
  const seen = new Set<string>();
  for (const ld of leftDigits) {
    for (const rd of rightDigits) {
      const left = digitBounds(ld);
      const right = digitBounds(rd);
      // Without negatives the first number must be the larger one, which a shorter number never is.
      if (skill === "subtraction" && !allowNegative && ld < rd) continue;
      const rightCount = right.max - right.min + 1;
      const pairAt = (index: number): [number, number] => [left.min + Math.floor(index / rightCount), right.min + (index % rightCount)];
      const accept = (index: number) => {
        const [l, r] = pairAt(index);
        if (skill === "addition") return true;
        return allowNegative ? l !== r : l > r;
      };
      const random = seededRandom(`${skill}:${ld}:${rd}:${allowNegative}`);
      for (const index of pickIndices((left.max - left.min + 1) * rightCount, ARITHMETIC_GROUP_CAP, random, accept)) {
        const [l, r] = pairAt(index);
        const spec: QuestionSpec =
          skill === "addition"
            ? { skill, exerciseType: "add", left: l, right: r }
            : { skill, exerciseType: "subtract", left: l, right: r };
        const id = idOfSpec(spec);
        if (!seen.has(id)) {
          seen.add(id);
          specs.push(spec);
        }
      }
    }
  }
  return specs;
}

/**
 * Division: a divisor `d` divides a dividend cleanly when the dividend is a multiple of `d` (whole answer) or of
 * d / gcd(d, 100) (answer with at most two decimals). Counting those multiples per divisor lets a sample be drawn
 * evenly from every valid question instead of hunting for them among random pairs.
 */
function divisionPool(dividendDigits: number[], divisorDigits: number[], decimals: boolean): QuestionSpec[] {
  const specs: QuestionSpec[] = [];
  const seen = new Set<string>();
  for (const dd of dividendDigits) {
    for (const vd of divisorDigits) {
      const dividends = digitBounds(dd);
      const divisors = digitBounds(vd);
      const options: Array<{ divisor: number; step: number; first: number; count: number }> = [];
      let total = 0;
      for (let divisor = Math.max(2, divisors.min); divisor <= divisors.max; divisor += 1) {
        const step = decimals ? divisor / gcd(divisor, 100) : divisor;
        const lowest = Math.max(dividends.min, divisor + 1);
        const first = Math.ceil(lowest / step);
        const count = Math.floor(dividends.max / step) - first + 1;
        if (count <= 0) continue;
        options.push({ divisor, step, first, count });
        total += count;
      }
      const random = seededRandom(`division:${dd}:${vd}:${decimals}`);
      for (const index of pickIndices(total, ARITHMETIC_GROUP_CAP, random, () => true)) {
        let remaining = index;
        for (const option of options) {
          if (remaining < option.count) {
            const dividend = (option.first + remaining) * option.step;
            const spec: QuestionSpec = { skill: "division", exerciseType: "divide", dividend, divisor: option.divisor };
            const id = idOfSpec(spec);
            if (!seen.has(id)) {
              seen.add(id);
              specs.push(spec);
            }
            break;
          }
          remaining -= option.count;
        }
      }
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function specsFor(config: PracticeConfig): Array<{ type: ExerciseType; specs: QuestionSpec[] }> {
  switch (config.skill) {
    case "multiplication":
      return [
        {
          type: "multiply",
          specs: config.left.flatMap((left) =>
            config.right.map((right): QuestionSpec => ({ skill: "multiplication", exerciseType: "multiply", left, right }))
          ),
        },
      ];
    case "addition":
      return [{ type: "add", specs: additivePool("addition", config.leftDigits, config.rightDigits, false) }];
    case "subtraction":
      return [{ type: "subtract", specs: additivePool("subtraction", config.leftDigits, config.rightDigits, config.allowNegative) }];
    case "division":
      return [{ type: "divide", specs: divisionPool(config.dividendDigits, config.divisorDigits, config.decimals) }];
    case "percentage":
      return config.exerciseTypes.map((type) => ({
        type,
        specs: percentagePool(type, config.difficulty, config.baseMin, config.baseMax),
      }));
    case "fraction":
      return config.exerciseTypes.map((type) => ({ type, specs: fractionPool(type, config.difficulty) }));
    case "square":
      return config.exerciseTypes.map((type) => ({ type, specs: squarePool(type, config.rangeMin, config.rangeMax) }));
    case "exponents":
      return exponentSpecs(config);
  }
}

const cache = new Map<string, PoolItem[]>();
const CACHE_LIMIT = 64;

/**
 * The pool of questions a configuration can ask. Pools are cached by configuration; callers
 * must not mutate the result.
 */
export function buildPool(config: PracticeConfig): PoolItem[] {
  const key = JSON.stringify(config);
  const cached = cache.get(key);
  if (cached) return cached;

  const difficulty = "difficulty" in config ? config.difficulty : null;
  const items: PoolItem[] = [];
  const seen = new Set<string>();
  for (const { specs } of specsFor(config)) {
    // Percentage groups are already thinned while generating; fraction groups are thinned after
    // the tier filter so a big superset never crowds out the questions that match.
    const matching = specs.filter((spec) => {
      if (difficulty && difficultyOfSpec(spec) !== difficulty) return false;
      // Only questions that survive the parser have exact, sensible answers.
      return parseQuestionId(idOfSpec(spec)) !== null;
    });
    for (const spec of config.skill === "fraction" ? thin(matching, FRACTION_GROUP_CAP) : matching) {
      const id = idOfSpec(spec);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, exerciseType: spec.exerciseType, concept: buildQuestion(spec).concept });
    }
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, items);
  return items;
}

const idSets = new WeakMap<PoolItem[], Set<string>>();

/** Whether a question id belongs to the configuration's pool. */
export function poolHas(config: PracticeConfig, id: string): boolean {
  const pool = buildPool(config);
  let ids = idSets.get(pool);
  if (!ids) {
    ids = new Set(pool.map((item) => item.id));
    idSets.set(pool, ids);
  }
  return ids.has(id);
}

/** Number of distinct questions per exercise type in a configuration's pool. */
export function poolSizeByType(config: PracticeConfig): Partial<Record<ExerciseType, number>> {
  const counts: Partial<Record<ExerciseType, number>> = {};
  for (const item of buildPool(config)) counts[item.exerciseType] = (counts[item.exerciseType] ?? 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

type ConfigResult = { ok: true; config: PracticeConfig } | { ok: false; error: string };

const fail = (error: string): ConfigResult => ({ ok: false, error });
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function parseOperandList(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OPERAND) return null;
  if (!value.every((v) => isInt(v, MIN_OPERAND, MAX_OPERAND))) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

/** A non-empty list of digit counts from 1 to `max`, deduplicated and sorted. */
function parseDigitList(value: unknown, max: number): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => isInt(v, 1, max))) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

/** Validates and canonicalises an untrusted practice configuration. */
export function parseConfig(raw: unknown): ConfigResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("config must be an object");
  const c = raw as Record<string, unknown>;
  const skill = c.skill;
  if (!SKILLS.includes(skill as Skill)) return fail(`skill must be one of ${SKILLS.join(", ")}`);

  if (skill === "multiplication") {
    const left = parseOperandList(c.left);
    const right = parseOperandList(c.right);
    if (!left || !right) return fail(`Selected numbers must be integers between ${MIN_OPERAND} and ${MAX_OPERAND}`);
    return { ok: true, config: { skill, exerciseTypes: ["multiply"], left, right } };
  }

  if (skill === "addition" || skill === "subtraction") {
    const leftDigits = parseDigitList(c.leftDigits, MAX_DIGITS);
    const rightDigits = parseDigitList(c.rightDigits, MAX_DIGITS);
    if (!leftDigits || !rightDigits) return fail(`Digit counts must be whole numbers from 1 to ${MAX_DIGITS}`);
    if (skill === "addition") return { ok: true, config: { skill, exerciseTypes: ["add"], leftDigits, rightDigits } };
    if (typeof c.allowNegative !== "boolean") return fail("allowNegative must be true or false");
    return { ok: true, config: { skill, exerciseTypes: ["subtract"], leftDigits, rightDigits, allowNegative: c.allowNegative } };
  }

  if (skill === "division") {
    const dividendDigits = parseDigitList(c.dividendDigits, MAX_DIGITS);
    const divisorDigits = parseDigitList(c.divisorDigits, MAX_DIVISOR_DIGITS);
    if (!dividendDigits) return fail(`Dividend digit counts must be whole numbers from 1 to ${MAX_DIGITS}`);
    if (!divisorDigits) return fail(`Divisor digit counts must be whole numbers from 1 to ${MAX_DIVISOR_DIGITS}`);
    if (typeof c.decimals !== "boolean") return fail("decimals must be true or false");
    return { ok: true, config: { skill, exerciseTypes: ["divide"], dividendDigits, divisorDigits, decimals: c.decimals } };
  }

  if (skill === "exponents") return parseExponentsConfig(c);

  const allowed = EXERCISE_TYPES[skill as Skill] as readonly string[];
  if (!Array.isArray(c.exerciseTypes) || c.exerciseTypes.length === 0 || !c.exerciseTypes.every((t) => allowed.includes(t))) {
    return fail(`exerciseTypes must be a non-empty list of: ${allowed.join(", ")}`);
  }
  const exerciseTypes = allowed.filter((t) => (c.exerciseTypes as string[]).includes(t));

  if (skill === "square") {
    if (!isInt(c.rangeMin, 1, MAX_SQUARE) || !isInt(c.rangeMax, 1, MAX_SQUARE) || c.rangeMin > c.rangeMax) {
      return fail(`Square range must be within 1-${MAX_SQUARE}`);
    }
    if (c.rangeMin > MAX_CUBE && exerciseTypes.some((t) => t === "cube" || t === "cube-root")) {
      return fail(`Cubes only go up to ${MAX_CUBE}. Start the range at ${MAX_CUBE} or lower, or turn the cube exercises off.`);
    }
    return { ok: true, config: { skill, exerciseTypes: exerciseTypes as never, rangeMin: c.rangeMin, rangeMax: c.rangeMax } };
  }

  if (!DIFFICULTIES.includes(c.difficulty as Difficulty)) return fail(`difficulty must be one of ${DIFFICULTIES.join(", ")}`);
  const difficulty = c.difficulty as Difficulty;

  if (skill === "fraction") {
    return { ok: true, config: { skill, exerciseTypes: exerciseTypes as never, difficulty } };
  }

  if (!isInt(c.baseMin, 1, MAX_BASE) || !isInt(c.baseMax, 1, MAX_BASE) || c.baseMin > c.baseMax) {
    return fail(`Number range must be within 1-${MAX_BASE}`);
  }
  return {
    ok: true,
    config: { skill: "percentage", exerciseTypes: exerciseTypes as never, difficulty, baseMin: c.baseMin, baseMax: c.baseMax },
  };
}
