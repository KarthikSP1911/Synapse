import { add, cmp, decimalPlaces, div, eq, isTerminating, mul, parseDecimal, rat, sub, toDecimalString, type Rational } from "@/lib/rational";
import { magnitudeCap, placesOf } from "./config";
import { OPERATIONS, OPERATION_SYMBOL, type Flash, type Operation, type RoundConfig } from "./types";

/**
 * The rules of a MindSprint calculation, in one place so the game, the scorer, the results screen and the
 * server all agree:
 *
 *  - Evaluation is sequential, left to right: each operator is applied to the running total, with no
 *    precedence. `20 × 3 − 5` is `(20 × 3) − 5 = 55`, and `10 + 5 × 2` is `(10 + 5) × 2 = 30`.
 *  - Everything is exact (rationals), never floating point.
 *  - A round is only ever generated so that every number, every running total and the answer are finite
 *    decimals with at most the round's decimal places, so the answer can always be typed exactly.
 *  - Answers are compared exactly with no tolerance: "3.50", "3.5" and "+3.5" are equal, "3.49" is not.
 */

const VALUE = /^(-?)(\d{1,12})(?:\.(\d{1,9}))?$/;

/** A canonical decimal string as an exact rational, or null if it is not a number. */
export function parseValue(text: string): Rational | null {
  const match = VALUE.exec(text);
  if (!match) return null;
  const magnitude = parseDecimal(match[3] === undefined ? match[2] : `${match[2]}.${match[3]}`);
  if (!magnitude) return null;
  return match[1] === "-" ? rat(-magnitude.n, magnitude.d) : magnitude;
}

/** The canonical string for a value (what flashes and answers are stored as), or null if it never terminates. */
export const valueToString = (value: Rational): string | null => toDecimalString(value);

/** One step of the calculation; null for division by zero. */
export function applyOperation(op: Operation, total: Rational, operand: Rational): Rational | null {
  switch (op) {
    case "add":
      return add(total, operand);
    case "subtract":
      return sub(total, operand);
    case "multiply":
      return mul(total, operand);
    case "divide":
      return operand.n === BigInt(0) ? null : div(total, operand);
  }
}

export interface Step {
  op: Operation | null;
  value: string;
  /** The running total after this step. */
  total: string;
}

export type Evaluation = { ok: true; steps: Step[]; answer: string } | { ok: false; reason: string };

/** Evaluates a sequence left to right. Fails on malformed input, division by zero or a result that is not a finite decimal. */
export function evaluateSequence(flashes: readonly Flash[]): Evaluation {
  if (flashes.length === 0) return { ok: false, reason: "The sequence is empty." };
  const steps: Step[] = [];
  let total: Rational | null = null;
  for (const [index, flash] of flashes.entries()) {
    const value = parseValue(flash.value);
    if (!value) return { ok: false, reason: `"${flash.value}" is not a number.` };
    if (index === 0) {
      if (flash.op !== null) return { ok: false, reason: "The first number has no operator." };
      total = value;
    } else {
      if (flash.op === null || !OPERATIONS.includes(flash.op)) return { ok: false, reason: `Number ${index + 1} has no valid operator.` };
      if (flash.op === "divide" && value.n === BigInt(0)) return { ok: false, reason: "Division by zero." };
      total = applyOperation(flash.op, total as Rational, value);
      if (!total) return { ok: false, reason: "Division by zero." };
    }
    const text = valueToString(total as Rational);
    if (text === null) return { ok: false, reason: "A step does not come to a finite decimal." };
    steps.push({ op: flash.op, value: flash.value, total: text });
  }
  return { ok: true, steps, answer: steps[steps.length - 1].total };
}

/** True when a total satisfies the round's limits on decimals, sign and size. */
export function totalFits(total: Rational, config: RoundConfig): boolean {
  if (!isTerminating(total)) return false;
  const places = decimalPlaces(total);
  if (places === null || places > placesOf(config)) return false;
  if (!config.allowNegative && total.n < BigInt(0)) return false;
  const abs = total.n < BigInt(0) ? rat(-total.n, total.d) : total;
  return cmp(abs, rat(magnitudeCap(config.digits))) <= 0;
}

/** Digits of the whole part of a canonical value string ("-12.5" gives "12"). */
const wholePart = (value: string): string => value.replace("-", "").split(".")[0];

/**
 * Checks that a sequence is something the generator could have produced for this configuration: right length
 * and operators, numbers with the right digit count and decimal places, negatives only where allowed, no
 * division by zero, and every running total within the round's limits. Returns the problem, or null if valid.
 *
 * The generator is tested against this, and the server uses it on uploads.
 */
export function checkSequence(config: RoundConfig, flashes: readonly Flash[]): string | null {
  if (flashes.length !== config.flashes) return `Expected ${config.flashes} numbers, got ${flashes.length}.`;
  const places = placesOf(config);
  const lowest = config.digits === 1 ? 1 : 10 ** (config.digits - 1);
  const highest = 10 ** config.digits - 1;

  let total: Rational | null = null;
  for (const [index, flash] of flashes.entries()) {
    const value = parseValue(flash.value);
    if (!value || valueToString(value) !== flash.value) return `Number ${index + 1} is not a canonical decimal.`;
    const whole = Number(wholePart(flash.value));
    if (whole < lowest || whole > highest) return `Number ${index + 1} does not have ${config.digits} digit${config.digits === 1 ? "" : "s"}.`;
    const fractionDigits = flash.value.includes(".") ? flash.value.split(".")[1].length : 0;
    if (fractionDigits > places) return `Number ${index + 1} has too many decimal places.`;
    if (flash.value.startsWith("-") && !config.allowNegative) return `Number ${index + 1} is negative.`;

    if (index === 0) {
      if (flash.op !== null) return "The first number has no operator.";
      total = value;
    } else {
      if (flash.op === null || !config.operations.includes(flash.op)) return `Number ${index + 1} uses an operation that is not enabled.`;
      const next = applyOperation(flash.op, total as Rational, value);
      if (!next) return "Division by zero.";
      total = next;
    }
    if (!totalFits(total as Rational, config)) return `The running total after number ${index + 1} is outside the round's limits.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export const MAX_ANSWER_CHARS = 24;
/** The answer box stops accepting characters here, comfortably below what the checker allows. */
const MAX_TYPED_CHARS = 16;

export type ParsedAnswer = { ok: true; value: Rational } | { ok: false; reason: string };

/** Reads what the player typed: digits with an optional decimal point and an optional leading minus (or plus). */
export function parseAnswerText(raw: string): ParsedAnswer {
  const text = raw.trim().replace(/[−–]/g, "-");
  if (text === "") return { ok: false, reason: "Enter an answer." };
  if (text.length > MAX_ANSWER_CHARS) return { ok: false, reason: "That answer is too long." };
  const sign = /^[-+]/.test(text) ? text[0] : "";
  const body = sign ? text.slice(1) : text;
  const magnitude = parseDecimal(body);
  if (!magnitude) return { ok: false, reason: "Use digits, an optional decimal point and an optional minus sign." };
  return { ok: true, value: sign === "-" ? rat(-magnitude.n, magnitude.d) : magnitude };
}

export type AnswerCheck = { status: "correct" } | { status: "incorrect" } | { status: "invalid"; reason: string };

/** Compares a typed answer with the exact answer (a canonical string). */
export function checkAnswer(raw: string, correct: string): AnswerCheck {
  const parsed = parseAnswerText(raw);
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
  const expected = parseValue(correct);
  if (!expected) return { status: "incorrect" };
  return { status: eq(parsed.value, expected) ? "correct" : "incorrect" };
}

/** Keeps only what can be part of this round's answers: digits, one decimal point if decimals are on, a leading minus if negatives are on. */
export function sanitizeAnswer(value: string, config: Pick<RoundConfig, "allowNegative" | "decimals">): string {
  const cleaned = value.replace(/[−–]/g, "-").replace(/[^\d.-]/g, "");
  const negative = config.allowNegative && cleaned.startsWith("-");
  const digits = cleaned.replace(/-/g, "");
  let body = digits;
  if (config.decimals) {
    const [whole, ...rest] = digits.split(".");
    body = rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
  } else {
    body = digits.replace(/\./g, "");
  }
  return (negative ? "-" : "") + body.slice(0, MAX_TYPED_CHARS);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** "-12.5" as "−12.5" (a true minus sign, which lines up with the operators). */
export const displayNumber = (value: string): string => value.replace("-", "−");

/** A number as it appears after an operator: negatives are bracketed so "× −3" cannot be misread. */
export const displayOperand = (value: string): string => (value.startsWith("-") ? `(${displayNumber(value)})` : value);

/** "× 3" for a flash, or just the number for the first one. */
export const displayFlash = (flash: Flash): string => (flash.op === null ? displayNumber(flash.value) : `${OPERATION_SYMBOL[flash.op]} ${displayOperand(flash.value)}`);

/** The whole calculation on one line: "20 × 3 − 5 = 55". */
export function displayCalculation(flashes: readonly Flash[], answer: string): string {
  return `${flashes.map(displayFlash).join(" ")} = ${displayNumber(answer)}`;
}
