import type { AnswerFormat, Choice, Question } from "./types";
import { eq, isLowestTerms, parseDecimal, rat, type Rational } from "@/lib/rational";

/**
 * Answer parsing and checking, shared by the browser (to flag unusable input before submitting)
 * and the server (the only place that decides correct/incorrect).
 *
 * Rules:
 *  - Numeric answers are compared as exact rationals, never floats, and never with a tolerance:
 *    "0.5" and "0.50" and ".5" are the same number, "0.49" and "0.5" are not.
 *  - A `%` sign is accepted only where the answer is a percentage.
 *  - Fractions are `a/b` with optional spaces around the slash. Equivalent fractions are accepted
 *    unless the exercise demands lowest terms.
 *  - Text that merely looks similar ("3/40" vs "3/4") is never matched by string comparison.
 */

export const MAX_ANSWER_LENGTH = 24;

export type ParsedAnswer =
  | { kind: "number"; value: Rational }
  | { kind: "fraction"; value: Rational; typedNumerator: bigint; typedDenominator: bigint }
  | { kind: "choice"; value: string };

export type ParseResult = { ok: true; answer: ParsedAnswer } | { ok: false; reason: string };

export function parseAnswer(format: AnswerFormat, raw: unknown, choices?: Choice[]): ParseResult {
  if (typeof raw !== "string") return { ok: false, reason: "Enter an answer." };
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "Enter an answer." };
  if (text.length > MAX_ANSWER_LENGTH) return { ok: false, reason: "That answer is too long." };

  switch (format.kind) {
    case "integer":
    case "number": {
      let body = text;
      if (format.kind === "number" && format.unit === "percent") {
        body = body.replace(/\s*%$/, "");
      } else if (body.includes("%")) {
        return { ok: false, reason: "Enter a number without a % sign." };
      }
      // Only signed formats take a minus, either the keyboard hyphen or the typographic minus sign.
      const signed = format.signed === true;
      const negative = signed && /^[-−]/.test(body);
      const unsigned = negative ? body.slice(1) : body;
      // A number that allows fractions also takes a/b, which is exact where a decimal like 1/9 cannot be.
      if (format.kind === "number" && format.fractions && unsigned.includes("/")) {
        const match = /^(\d{1,6})\s*\/\s*(\d{1,6})$/.exec(unsigned);
        if (!match) return { ok: false, reason: "Enter a fraction like 1/8." };
        if (BigInt(match[2]) === BigInt(0)) return { ok: false, reason: "The denominator cannot be zero." };
        const value = rat(BigInt(match[1]), BigInt(match[2]));
        return { ok: true, answer: { kind: "number", value: negative ? rat(-value.n, value.d) : value } };
      }
      const parsed = parseDecimal(unsigned);
      if (!parsed) {
        if (format.kind === "number" && format.fractions) return { ok: false, reason: "Use digits with a decimal point or a slash, and an optional minus sign at the start." };
        return { ok: false, reason: signed ? "Use digits, with an optional minus sign at the start." : "Use digits and a decimal point only." };
      }
      return { ok: true, answer: { kind: "number", value: negative ? rat(-parsed.n, parsed.d) : parsed } };
    }
    case "fraction": {
      const match = /^(\d{1,6})(?:\s*\/\s*(\d{1,6}))?$/.exec(text);
      if (!match) return { ok: false, reason: "Enter a fraction like 3/4." };
      const n = BigInt(match[1]);
      const d = BigInt(match[2] ?? "1");
      if (d === BigInt(0)) return { ok: false, reason: "The denominator cannot be zero." };
      return { ok: true, answer: { kind: "fraction", value: rat(n, d), typedNumerator: n, typedDenominator: d } };
    }
    case "choice": {
      const picked = choices?.find((c) => c.value === text);
      return picked ? { ok: true, answer: { kind: "choice", value: picked.value } } : { ok: false, reason: "Pick one of the options." };
    }
  }
}

/** Message explaining why the input cannot be submitted, or null if it is well-formed. */
export function inputProblem(format: AnswerFormat, raw: string, choices?: Choice[]): string | null {
  const parsed = parseAnswer(format, raw, choices);
  return parsed.ok ? null : parsed.reason;
}

export type AnswerCheck = { status: "correct" } | { status: "incorrect" } | { status: "invalid"; reason: string };

export function checkAnswer(question: Pick<Question, "answerFormat" | "choices" | "expected">, raw: unknown): AnswerCheck {
  const parsed = parseAnswer(question.answerFormat, raw, question.choices);
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
  const { answer } = parsed;
  const expected = question.expected;

  if (answer.kind === "choice") {
    return { status: answer.value === expected ? "correct" : "incorrect" };
  }
  if (typeof expected === "string") return { status: "incorrect" };

  if (answer.kind === "fraction") {
    if (!eq(answer.value, expected)) return { status: "incorrect" };
    const needsLowestTerms = question.answerFormat.kind === "fraction" && question.answerFormat.lowestTerms;
    // "6/8" equals 3/4 but is not simplified; a whole-number typed as "5" is trivially in lowest terms.
    return needsLowestTerms && !isLowestTerms(answer.typedNumerator, answer.typedDenominator)
      ? { status: "incorrect" }
      : { status: "correct" };
  }
  return { status: eq(answer.value, expected) ? "correct" : "incorrect" };
}
