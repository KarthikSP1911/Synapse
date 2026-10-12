import type { AnswerFormat, Difficulty, ExerciseTypeOf, ExponentMode, QuestionSpec } from "./types";
import { decimalPlaces, isInteger, rat, toDecimalString, toFractionString, type Rational } from "./rational";

/**
 * The Exponents skill: questions about powers and the laws of exponents, answered either as the exponent that
 * completes a power ("power form": 2^5 × 2^7 = 2^?) or as the whole number ("final value": 2^5 × 2^7 = ?).
 *
 * Every question is a small family of integers, so its id (`exponents:p:mul-law:std:2:5:7`) holds everything needed
 * to rebuild it. All arithmetic is exact: powers are BigInts and values are rationals, so 2^-3 is 1/8, never 0.125 as
 * a float. Anything that cannot be asked cleanly (an ambiguous base, a result that is too large, an exponent
 * outside the limits) makes `exponentCore` return null, which is how invalid ids and impossible candidates are rejected.
 */

export type ExponentType = ExerciseTypeOf<"exponents">;
export type ExponentSpec = Extract<QuestionSpec, { skill: "exponents" }>;

/** Bases are 2 to 20 in size (a sign is added separately). 0 and 1 make every power the same, so they are never asked. */
export const EXPONENT_BASE_MIN = 2;
export const EXPONENT_BASE_MAX = 20;
/** Largest exponent written in a question. */
export const EXPONENT_LIMIT = 12;
/** Largest exponent an answer may be: (2^12)^12 = 2^144 is the biggest a configuration can produce. */
export const RESULT_EXPONENT_LIMIT = 150;
/** Largest whole number, numerator or denominator any final-value answer may have. */
export const EXPONENT_RESULT_MAX = 1_000_000;
export const EXPONENT_RESULT_MIN = 10;
export const EXPONENT_RESULT_CHOICES = [1_000, 10_000, 100_000, 1_000_000] as const;

// ---------------------------------------------------------------------------
// Question shapes
// ---------------------------------------------------------------------------

interface Shape {
  /** Integers after the base. */
  exps: number;
  modes: readonly ExponentMode[];
}

const BOTH = ["power", "value"] as const;
const POWER = ["power"] as const;
const VALUE = ["value"] as const;

/** Which variants each exercise type has, how many exponents each takes and in which answer mode it exists. */
const SHAPES: Record<ExponentType, Record<string, Shape>> = {
  evaluate: { std: { exps: 1, modes: VALUE } },
  base: {
    direct: { exps: 1, modes: VALUE },
    mul: { exps: 2, modes: POWER },
    div: { exps: 2, modes: POWER },
    pow: { exps: 2, modes: POWER },
  },
  exponent: {
    direct: { exps: 1, modes: VALUE },
    mul1: { exps: 2, modes: POWER },
    mul2: { exps: 2, modes: POWER },
    div1: { exps: 2, modes: POWER },
    div2: { exps: 2, modes: POWER },
    pow1: { exps: 2, modes: POWER },
    pow2: { exps: 2, modes: POWER },
  },
  "mul-law": { std: { exps: 2, modes: BOTH } },
  "div-law": { std: { exps: 2, modes: BOTH } },
  "power-law": { std: { exps: 2, modes: BOTH } },
  "zero-negative": {
    direct: { exps: 1, modes: VALUE },
    recip: { exps: 1, modes: BOTH },
    mul: { exps: 2, modes: BOTH },
    div: { exps: 2, modes: BOTH },
  },
  simplify: {
    a: { exps: 3, modes: BOTH },
    b: { exps: 3, modes: BOTH },
    c: { exps: 3, modes: BOTH },
    d: { exps: 3, modes: BOTH },
    e: { exps: 3, modes: BOTH },
    f: { exps: 3, modes: BOTH },
    g: { exps: 4, modes: BOTH },
    i: { exps: 4, modes: BOTH },
  },
};

/** Variants of a type that exist in an answer mode, with how many exponents each takes. */
export function variantsFor(type: ExponentType, mode: ExponentMode): Array<{ variant: string; exps: number }> {
  return Object.entries(SHAPES[type])
    .filter(([, shape]) => shape.modes.includes(mode))
    .map(([variant, shape]) => ({ variant, exps: shape.exps }));
}

export const isExponentType = (value: unknown): value is ExponentType =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(SHAPES, value);

// ---------------------------------------------------------------------------
// Notation
// ---------------------------------------------------------------------------

/** A base as written in front of an exponent: negatives need brackets, (-2)^3. */
const baseText = (b: number): string => (b < 0 ? `(${b})` : String(b));
/** A number inside a sum or product of exponents: 3 + (-2). */
const num = (x: number): string => (x < 0 ? `(${x})` : String(x));
const power = (base: string, exp: number | string): string => `${base}^${exp}`;

type Law = "mul" | "div" | "pow";

/** `b^p × b^q`, `b^p ÷ b^q` or `(b^p)^q`, with any part replaceable by a "?". */
function lawText(law: Law, base: string, p: number | string, q: number | string): string {
  if (law === "mul") return `${power(base, p)} × ${power(base, q)}`;
  if (law === "div") return `${power(base, p)} ÷ ${power(base, q)}`;
  return `(${power(base, p)})^${q}`;
}

const lawExponent = (law: Law, p: number, q: number): number => (law === "mul" ? p + q : law === "div" ? p - q : p * q);

const RULES: Record<Law, string> = {
  mul: "Same base, multiply the powers: add the exponents.",
  div: "Same base, divide the powers: subtract the exponents.",
  pow: "Power of a power: multiply the exponents.",
};

/** The working for combining two powers, e.g. `2^3 × 2^4 = 2^(3 + 4) = 2^7`. */
function lawWork(law: Law, b: number, p: number, q: number): string {
  const bs = baseText(b);
  const r = lawExponent(law, p, q);
  const how = law === "mul" ? `${p} + ${num(q)}` : law === "div" ? `${p} - ${num(q)}` : `${p} × ${num(q)}`;
  return `${lawText(law, bs, p, q)} = ${power(bs, `(${how})`)} = ${power(bs, r)}`;
}

// ---------------------------------------------------------------------------
// Exact values
// ---------------------------------------------------------------------------

/** b^e as an exact rational, or null when it is beyond the biggest answer a question may have. */
function powValue(b: number, e: number): Rational | null {
  const size = Math.abs(b);
  let magnitude = 1;
  for (let i = 0; i < Math.abs(e); i += 1) {
    magnitude *= size;
    if (magnitude > EXPONENT_RESULT_MAX) return null;
  }
  const n = BigInt(b) ** BigInt(Math.abs(e));
  return e >= 0 ? rat(n) : rat(1, n);
}

/** Whether a value's numerator and denominator both fit under `cap`. */
export function fitsResult(value: Rational, cap: number): boolean {
  const bound = BigInt(cap);
  const n = value.n < BigInt(0) ? -value.n : value.n;
  return n <= bound && value.d <= bound;
}

/** The short decimal when there is one (0.125), else the fraction (1/9): always something the answer box accepts. */
function valueText(v: Rational): string {
  if (isInteger(v)) return v.n.toString();
  const places = decimalPlaces(v);
  return places !== null && places <= 6 ? (toDecimalString(v) as string) : toFractionString(v);
}

/** Both forms, for explanations: 1/8 = 0.125. */
function valueBoth(v: Rational): string {
  const text = valueText(v);
  return text === toFractionString(v) ? text : `${toFractionString(v)} = ${text}`;
}

/** The value as it is written inside a question: a whole number or a fraction. */
const valueInline = (v: Rational): string => toFractionString(v);

/** Answer box for a number: whole numbers need only digits, anything else also takes a point and a slash. */
function formatOf(v: Rational): AnswerFormat {
  const negative = v.n < BigInt(0);
  if (isInteger(v)) return negative ? { kind: "integer", signed: true } : { kind: "integer" };
  return negative ? { kind: "number", signed: true, fractions: true } : { kind: "number", fractions: true };
}

const EXPONENT_FORMAT: AnswerFormat = { kind: "integer", signed: true };

// ---------------------------------------------------------------------------
// Building a question
// ---------------------------------------------------------------------------

export interface ExponentCore {
  prompt: string;
  answerFormat: AnswerFormat;
  answerText: string;
  expected: Rational;
  hint: string;
  explanation: string;
  concept: string;
  difficulty: Difficulty;
  /** Every exponent the question shows or asks for, so a configuration can check the kinds it allows. */
  exponents: number[];
  /** The number a final-value question is about (null in power form), so a configuration can check its size. */
  value: Rational | null;
}

interface Draft {
  prompt: string;
  /** The exponent, base or value asked for. */
  answer: Rational;
  answerText: string;
  answerFormat: AnswerFormat;
  hint: string;
  explanation: string;
  concept: string;
  exponents: number[];
  value: Rational | null;
}

interface Outcome {
  answer: Rational;
  text: string;
  format: AnswerFormat;
  value: Rational | null;
}

/** The answer for "b^r" asked in `mode`: the exponent itself in power form, the number it stands for in final-value form. */
function outcomeOf(mode: ExponentMode, b: number, r: number): Outcome | null {
  if (!Number.isInteger(r) || Math.abs(r) > RESULT_EXPONENT_LIMIT) return null;
  if (mode === "power") return { answer: rat(r), text: String(r), format: EXPONENT_FORMAT, value: null };
  const v = powValue(b, r);
  return v ? { answer: v, text: valueText(v), format: formatOf(v), value: v } : null;
}

/** "5^0 = 1", "2^-3 = 1/2^3 = 1/8 = 0.125": what a power stands for, shown step by step. */
function valueWork(b: number, r: number, v: Rational): string {
  const bs = baseText(b);
  if (r >= 0) return `${power(bs, r)} = ${valueText(v)}`;
  return `${power(bs, r)} = 1/${power(bs, -r)} = ${valueBoth(v)}`;
}

/** The sentence that finishes an explanation: the power form is the answer, or it is turned into a number. */
function finishWork(mode: ExponentMode, work: string, b: number, r: number, outcome: Outcome): string {
  return mode === "power" || !outcome.value ? `${work}.` : `${work}, and ${valueWork(b, r, outcome.value)}.`;
}

const powersOf = (b: number): string => `exponents:powers-of:${Math.abs(b)}`;
const LAW_CONCEPT: Record<Law, string> = { mul: "exponents:law:product", div: "exponents:law:quotient", pow: "exponents:law:power" };

function asLaw(prefix: string): Law | null {
  return prefix === "mul" || prefix === "div" || prefix === "pow" ? prefix : null;
}

/** `2^3 × 2^4 = ?` or `= 2^?`. */
function lawDraft(mode: ExponentMode, law: Law, b: number, p: number, q: number, concept: string, hint: string): Draft | null {
  // Raising a power to the power 1 (or taking the power 1 of something) changes nothing, so it teaches nothing.
  if (law === "pow" && (p === 1 || q === 1)) return null;
  const r = lawExponent(law, p, q);
  const outcome = outcomeOf(mode, b, r);
  if (!outcome) return null;
  const bs = baseText(b);
  return {
    prompt: `${lawText(law, bs, p, q)} = ${mode === "power" ? power(bs, "?") : "?"}`,
    answer: outcome.answer,
    answerText: outcome.text,
    answerFormat: outcome.format,
    hint,
    explanation: `${RULES[law]} ${finishWork(mode, lawWork(law, b, p, q), b, r, outcome)}`,
    concept,
    exponents: [p, q, r],
    value: outcome.value,
  };
}

/** The base of a "?" base question has one answer only when its sign cannot be flipped: an even power hides the sign. */
const needsPositiveBase = (r: number): boolean => r % 2 === 0;
const POSITIVE_NOTE = " (? > 0)";

function evaluateDraft(mode: ExponentMode, b: number, e: number): Draft | null {
  // 2^1 is not a calculation, and a single power only has a value to find in final-value form.
  if (mode !== "value" || e < 2) return null;
  const outcome = outcomeOf(mode, b, e);
  if (!outcome || !outcome.value) return null;
  const bs = baseText(b);
  const factors = e <= 6 ? Array.from({ length: e }, () => bs).join(" × ") : `${bs} × ${bs} × … × ${bs} (${e} factors)`;
  return {
    prompt: `${power(bs, e)} = ?`,
    answer: outcome.answer,
    answerText: outcome.text,
    answerFormat: outcome.format,
    hint: b < 0 ? "An odd number of negative factors gives a negative answer, an even number a positive one." : `Multiply ${b} by itself ${e} times.`,
    explanation: `${power(bs, e)} = ${factors} = ${outcome.text}.`,
    concept: powersOf(b),
    exponents: [e],
    value: outcome.value,
  };
}

function baseDraft(mode: ExponentMode, variant: string, b: number, exps: number[]): Draft | null {
  if (variant === "direct") {
    const n = exps[0];
    if (n < 2 || (needsPositiveBase(n) && b < 0)) return null;
    const v = powValue(b, n);
    if (!v) return null;
    return {
      prompt: `?^${n} = ${valueInline(v)}${needsPositiveBase(n) ? POSITIVE_NOTE : ""}`,
      answer: rat(b),
      answerText: String(b),
      answerFormat: b < 0 ? { kind: "integer", signed: true } : { kind: "integer" },
      hint: `Test small whole numbers: which one, used ${n} times as a factor, makes ${valueInline(v)}?`,
      explanation: `${power(baseText(b), n)} = ${valueInline(v)}, so the base is ${b}.`,
      concept: powersOf(b),
      exponents: [n],
      value: v,
    };
  }
  const law = asLaw(variant);
  if (!law || mode !== "power") return null;
  const [p, q] = exps;
  const r = lawExponent(law, p, q);
  // r = 0 would make every base work, and an even r hides the sign of the base.
  if (r === 0 || Math.abs(r) > RESULT_EXPONENT_LIMIT || (needsPositiveBase(r) && b < 0)) return null;
  const bs = baseText(b);
  const joined = law === "mul" ? `${p} + ${num(q)}` : law === "div" ? `${p} - ${num(q)}` : `${p} × ${num(q)}`;
  return {
    prompt: `${lawText(law, "?", p, q)} = ${power(bs, r)}${needsPositiveBase(r) ? POSITIVE_NOTE : ""}`,
    answer: rat(b),
    answerText: String(b),
    answerFormat: EXPONENT_FORMAT,
    hint: `${RULES[law]} Then compare both sides.`,
    explanation: `${RULES[law]} The left side is ?^(${joined}) = ?^${r}. It equals ${power(bs, r)}, so the base is ${b}.`,
    concept: LAW_CONCEPT[law],
    exponents: [p, q, r],
    value: null,
  };
}

function exponentDraft(mode: ExponentMode, variant: string, b: number, exps: number[]): Draft | null {
  const bs = baseText(b);
  if (variant === "direct") {
    const n = exps[0];
    const v = powValue(b, n);
    if (!v) return null;
    return {
      prompt: `${power(bs, "?")} = ${valueInline(v)}`,
      answer: rat(n),
      answerText: String(n),
      answerFormat: formatOf(rat(n)),
      hint: n < 0 ? "A fraction means a negative exponent: write the bottom as a power of the base." : `Which power of ${bs} makes ${valueInline(v)}?`,
      explanation: `${valueWork(b, n, v)}, so the exponent is ${n}.`,
      concept: powersOf(b),
      exponents: [n],
      value: v,
    };
  }
  const law = asLaw(variant.slice(0, 3));
  const hidden = variant.slice(3);
  if (!law || mode !== "power" || (hidden !== "1" && hidden !== "2")) return null;
  const [p, q] = exps;
  // (b^?)^0 = 1 is true for every exponent, so a zero multiplier cannot be solved for.
  if (law === "pow" && (hidden === "1" ? q === 0 : p === 0)) return null;
  const r = lawExponent(law, p, q);
  if (Math.abs(r) > RESULT_EXPONENT_LIMIT) return null;
  const answer = hidden === "1" ? p : q;
  const shownP = hidden === "1" ? "?" : p;
  const shownQ = hidden === "2" ? "?" : q;
  let solve: string;
  if (law === "mul") solve = hidden === "1" ? `? + ${num(q)} = ${r}, so ? = ${r} - ${num(q)} = ${p}` : `${p} + ? = ${r}, so ? = ${r} - ${num(p)} = ${q}`;
  else if (law === "div") solve = hidden === "1" ? `? - ${num(q)} = ${r}, so ? = ${r} + ${num(q)} = ${p}` : `${p} - ? = ${r}, so ? = ${p} - ${num(r)} = ${q}`;
  else solve = hidden === "1" ? `? × ${num(q)} = ${r}, so ? = ${r} ÷ ${num(q)} = ${p}` : `${p} × ? = ${r}, so ? = ${r} ÷ ${num(p)} = ${q}`;
  return {
    prompt: `${lawText(law, bs, shownP, shownQ)} = ${power(bs, r)}`,
    answer: rat(answer),
    answerText: String(answer),
    answerFormat: EXPONENT_FORMAT,
    hint: `${RULES[law]} The result has exponent ${r}.`,
    explanation: `${RULES[law]} The exponents must give ${r}: ${solve}.`,
    concept: LAW_CONCEPT[law],
    exponents: [p, q, r],
    value: null,
  };
}

function zeroNegativeDraft(mode: ExponentMode, variant: string, b: number, exps: number[]): Draft | null {
  const bs = baseText(b);
  if (variant === "direct") {
    const e = exps[0];
    const outcome = outcomeOf(mode, b, e);
    if (mode !== "value" || e > 0 || !outcome || !outcome.value) return null;
    return {
      prompt: `${power(bs, e)} = ?`,
      answer: outcome.answer,
      answerText: outcome.text,
      answerFormat: outcome.format,
      hint: e === 0 ? "Any number except 0, raised to the power 0, is 1." : `A negative exponent flips the base: ${bs}^-n is 1 ÷ ${bs}^n.`,
      explanation:
        e === 0
          ? `Any non-zero number to the power 0 is 1, so ${power(bs, 0)} = 1.`
          : `A negative exponent means the reciprocal: ${valueWork(b, e, outcome.value)}.`,
      concept: "exponents:zero-negative",
      exponents: [e],
      value: outcome.value,
    };
  }
  if (variant === "recip") {
    const e = exps[0];
    if (e === 0) return null;
    const outcome = outcomeOf(mode, b, -e);
    if (!outcome) return null;
    return {
      prompt: `1 ÷ ${power(bs, e)} = ${mode === "power" ? power(bs, "?") : "?"}`,
      answer: outcome.answer,
      answerText: outcome.text,
      answerFormat: outcome.format,
      hint: `1 ÷ ${bs}^n is the same as ${bs} to the power -n.`,
      explanation: `Dividing 1 by a power flips the sign of its exponent. ${finishWork(mode, `1 ÷ ${power(bs, e)} = ${power(bs, -e)}`, b, -e, outcome)}`,
      concept: "exponents:zero-negative",
      exponents: [e, -e],
      value: outcome.value,
    };
  }
  const law = variant === "mul" || variant === "div" ? variant : null;
  if (!law) return null;
  const [p, q] = exps;
  const r = lawExponent(law, p, q);
  // This is the zero-and-negative drill: some exponent in the question has to be zero or negative.
  if (Math.min(p, q, r) > 0) return null;
  const hint = [p, q, r].includes(0) ? "Anything to the power 0 is 1. The exponent rules still work with zero." : "The exponent rules still work with negative exponents: just add or subtract carefully.";
  return lawDraft(mode, law, b, p, q, "exponents:zero-negative", hint);
}

interface SimplifyShape {
  expr: (bs: string, e: number[]) => string;
  steps: (e: number[]) => { exponent: number; text: string } | null;
}

const SIMPLIFY: Record<string, SimplifyShape> = {
  a: {
    expr: (bs, [p, q, r]) => `${power(bs, p)} × ${power(bs, q)} ÷ ${power(bs, r)}`,
    steps: ([p, q, r]) => ({
      exponent: p + q - r,
      text: `Multiply first, adding exponents: ${p} + ${num(q)} = ${p + q}. Then divide, subtracting: ${p + q} - ${num(r)} = ${p + q - r}.`,
    }),
  },
  b: {
    expr: (bs, [p, q, r]) => `(${power(bs, p)})^${q} × ${power(bs, r)}`,
    steps: ([p, q, r]) => ({
      exponent: p * q + r,
      text: `Power of a power: ${p} × ${num(q)} = ${p * q}. Then multiply, adding: ${p * q} + ${num(r)} = ${p * q + r}.`,
    }),
  },
  c: {
    expr: (bs, [p, q, r]) => `(${power(bs, p)})^${q} ÷ ${power(bs, r)}`,
    steps: ([p, q, r]) => ({
      exponent: p * q - r,
      text: `Power of a power: ${p} × ${num(q)} = ${p * q}. Then divide, subtracting: ${p * q} - ${num(r)} = ${p * q - r}.`,
    }),
  },
  d: {
    expr: (bs, [p, q, r]) => `(${power(bs, p)} × ${power(bs, q)})^${r}`,
    steps: ([p, q, r]) => ({
      exponent: (p + q) * r,
      text: `Inside the brackets, add: ${p} + ${num(q)} = ${p + q}. Then raise to the power: ${p + q} × ${num(r)} = ${(p + q) * r}.`,
    }),
  },
  e: {
    expr: (bs, [p, q, r]) => `(${power(bs, p)} ÷ ${power(bs, q)})^${r}`,
    steps: ([p, q, r]) => ({
      exponent: (p - q) * r,
      text: `Inside the brackets, subtract: ${p} - ${num(q)} = ${p - q}. Then raise to the power: ${p - q} × ${num(r)} = ${(p - q) * r}.`,
    }),
  },
  f: {
    expr: (bs, [p, q, r]) => `${power(bs, p)} × ${power(bs, q)} × ${power(bs, r)}`,
    steps: ([p, q, r]) => ({ exponent: p + q + r, text: `Add all the exponents: ${p} + ${num(q)} + ${num(r)} = ${p + q + r}.` }),
  },
  g: {
    expr: (bs, [p, q, r, s]) => `(${power(bs, p)})^${q} ÷ (${power(bs, r)})^${s}`,
    steps: ([p, q, r, s]) => ({
      exponent: p * q - r * s,
      text: `Power of a power on each side: ${p} × ${num(q)} = ${p * q} and ${r} × ${num(s)} = ${r * s}. Then divide, subtracting: ${p * q} - ${num(r * s)} = ${p * q - r * s}.`,
    }),
  },
  i: {
    expr: (bs, [p, q, r, s]) => `(${power(bs, p)})^${q} × (${power(bs, r)})^${s}`,
    steps: ([p, q, r, s]) => ({
      exponent: p * q + r * s,
      text: `Power of a power on each side: ${p} × ${num(q)} = ${p * q} and ${r} × ${num(s)} = ${r * s}. Then multiply, adding: ${p * q} + ${num(r * s)} = ${p * q + r * s}.`,
    }),
  },
};

function simplifyDraft(mode: ExponentMode, variant: string, b: number, exps: number[]): Draft | null {
  const shape = Object.prototype.hasOwnProperty.call(SIMPLIFY, variant) ? SIMPLIFY[variant] : null;
  if (!shape) return null;
  const steps = shape.steps(exps);
  if (!steps) return null;
  const r = steps.exponent;
  const outcome = outcomeOf(mode, b, r);
  if (!outcome) return null;
  const bs = baseText(b);
  return {
    prompt: `${shape.expr(bs, exps)} = ${mode === "power" ? power(bs, "?") : "?"}`,
    answer: outcome.answer,
    answerText: outcome.text,
    answerFormat: outcome.format,
    hint: "Work in order: brackets first, then powers of powers, then multiply and divide from left to right.",
    explanation: finishWork(mode, `${steps.text} So the result is ${power(bs, r)}`, b, r, outcome),
    concept: "exponents:simplify",
    exponents: [...exps, r],
    value: outcome.value,
  };
}

function draftOf(spec: ExponentSpec, b: number, exps: number[]): Draft | null {
  const { mode, variant } = spec;
  switch (spec.exerciseType) {
    case "evaluate":
      return evaluateDraft(mode, b, exps[0]);
    case "base":
      return baseDraft(mode, variant, b, exps);
    case "exponent":
      return exponentDraft(mode, variant, b, exps);
    case "mul-law":
      return lawDraft(mode, "mul", b, exps[0], exps[1], LAW_CONCEPT.mul, "Same base: add the exponents, keep the base.");
    case "div-law":
      return lawDraft(mode, "div", b, exps[0], exps[1], LAW_CONCEPT.div, "Same base: subtract the exponents, keep the base.");
    case "power-law":
      return lawDraft(mode, "pow", b, exps[0], exps[1], LAW_CONCEPT.pow, "A power of a power: multiply the exponents.");
    case "zero-negative":
      return zeroNegativeDraft(mode, variant, b, exps);
    case "simplify":
      return simplifyDraft(mode, variant, b, exps);
  }
}

/** Beginner for plain positive powers, advanced for anything with a negative sign or several steps. */
function tierOf(type: ExponentType, b: number, given: number[], shown: number[]): Difficulty {
  if (b < 0 || type === "simplify" || shown.some((e) => e < 0)) return "advanced";
  if (type === "base" || type === "exponent" || type === "power-law" || type === "zero-negative" || shown.includes(0)) return "intermediate";
  return given.every((e) => e <= 6) ? "beginner" : "intermediate";
}

const isBase = (b: unknown): b is number =>
  typeof b === "number" && Number.isInteger(b) && Math.abs(b) >= EXPONENT_BASE_MIN && Math.abs(b) <= EXPONENT_BASE_MAX;
const isGivenExponent = (e: unknown): e is number => typeof e === "number" && Number.isInteger(e) && Math.abs(e) <= EXPONENT_LIMIT;

/** Everything about a question, or null if it is not a clean, unambiguous, in-limits question. */
export function exponentCore(spec: ExponentSpec): ExponentCore | null {
  if (!isExponentType(spec.exerciseType) || !Object.prototype.hasOwnProperty.call(SHAPES[spec.exerciseType], spec.variant)) return null;
  const shape = SHAPES[spec.exerciseType][spec.variant];
  if (!shape.modes.includes(spec.mode) || spec.args.length !== shape.exps + 1) return null;
  const [b, ...exps] = spec.args;
  if (!isBase(b) || !exps.every(isGivenExponent)) return null;
  const draft = draftOf(spec, b, exps);
  if (!draft) return null;
  return {
    prompt: draft.prompt,
    answerFormat: draft.answerFormat,
    answerText: draft.answerText,
    expected: draft.answer,
    hint: draft.hint,
    explanation: draft.explanation,
    concept: draft.concept,
    difficulty: tierOf(spec.exerciseType, b, exps, draft.exponents),
    exponents: draft.exponents,
    value: draft.value,
  };
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export function idOfExponentSpec(spec: ExponentSpec): string {
  return `exponents:${spec.mode === "power" ? "p" : "v"}:${spec.exerciseType}:${spec.variant}:${spec.args.join(":")}`;
}

/** A canonical integer token: "-3", "0", "12", never "+3", "03" or "-0". */
function parseSigned(token: string | undefined): number | null {
  if (token === undefined || !/^-?(0|[1-9]\d{0,2})$/.test(token) || token === "-0") return null;
  return Number(token);
}

/** The spec an `exponents:...` id names, or null if the id is malformed or its question is not valid. */
export function parseExponentSpec(parts: string[]): ExponentSpec | null {
  const [, m, type, variant, ...rest] = parts;
  const mode: ExponentMode | null = m === "p" ? "power" : m === "v" ? "value" : null;
  if (!mode || !isExponentType(type) || variant === undefined) return null;
  const args = rest.map(parseSigned);
  if (args.some((a) => a === null)) return null;
  const spec: ExponentSpec = { skill: "exponents", exerciseType: type, mode, variant, args: args as number[] };
  return exponentCore(spec) ? spec : null;
}
