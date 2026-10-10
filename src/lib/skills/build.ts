import type { Question, QuestionDetails, PublicQuestion, QuestionSpec, Choice } from "./types";
import { fmt, idOfSpec, parseFraction, parseQuestionId } from "./ids";
import { difficultyOfSpec, convertPercent } from "./tiers";
import {
  PERCENT,
  add,
  div,
  fromNumber,
  gcd,
  mul,
  parseDecimal,
  rat,
  sub,
  toDecimalString,
  toFractionString,
  toPercentNumber,
  type Rational,
} from "./rational";

/** Everything a spec contributes beyond the id and difficulty. */
type Core = Omit<QuestionDetails, "id" | "difficulty">;

const decimal = (r: Rational): string => toDecimalString(r) ?? toFractionString(r);
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

const ORDINAL_NAMES: Record<number, string> = {
  2: "half",
  3: "third",
  4: "quarter",
  5: "fifth",
  8: "eighth",
  10: "tenth",
  20: "twentieth",
  25: "twenty-fifth",
  40: "fortieth",
  50: "fiftieth",
  100: "hundredth",
};

// ---------------------------------------------------------------------------
// Multiplication
// ---------------------------------------------------------------------------

function multiplication(left: number, right: number): Core {
  const product = left * right;
  const big = Math.max(left, right);
  const small = Math.min(left, right);
  let hint: string | undefined;
  let explanation: string | undefined;
  if (big > 10) {
    if (big % 10 === 0) {
      hint = `Multiply ${big / 10} × ${small}, then add a zero.`;
      explanation = `${big / 10} × ${small} = ${(big / 10) * small}, and times 10 gives ${product}.`;
    } else {
      const tens = Math.floor(big / 10) * 10;
      const units = big - tens;
      hint = `Split ${big} into ${tens} + ${units}.`;
      explanation = `${big} × ${small} = (${tens} × ${small}) + (${units} × ${small}) = ${tens * small} + ${units * small} = ${product}.`;
    }
  }
  return {
    concept: `multiplication:${left}x${right}`,
    prompt: `${left} × ${right}`,
    answerFormat: { kind: "integer" },
    answerText: String(product),
    expected: rat(product),
    hint,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

const pctConcept = (percent: number | string) => `percentage:pct:${percent}`;

function percentOf(percent: number, base: number): Core {
  const rate = div(fromNumber(percent), PERCENT);
  const answer = mul(rate, rat(base));
  const ans = decimal(answer);
  const name = rate.n === BigInt(1) ? ORDINAL_NAMES[Number(rate.d)] : undefined;
  const splits = rate.d <= BigInt(base) && BigInt(base) % rate.d === BigInt(0);
  let explanation: string;
  if (rate.d === BigInt(1)) {
    explanation = `${fmt(percent)}% = ${rate.n}, so ${base} × ${rate.n} = ${ans}.`;
  } else if (name) {
    explanation = `${fmt(percent)}% is one-${name}, and ${base} ÷ ${rate.d} = ${ans}.`;
  } else if (splits) {
    explanation = `${fmt(percent)}% = ${rate.n}/${rate.d}, so ${base} ÷ ${rate.d} × ${rate.n} = ${ans}.`;
  } else {
    explanation = `${fmt(percent)}% = ${rate.n}/${rate.d}, so ${base} × ${rate.n} ÷ ${rate.d} = ${ans}.`;
  }
  return {
    concept: pctConcept(percent),
    prompt: `What is ${fmt(percent)}% of ${base}?`,
    answerFormat: { kind: "number" },
    answerText: ans,
    expected: answer,
    hint: `Write ${fmt(percent)}% as ${toFractionString(rate)}.`,
    explanation,
  };
}

function percentWhat(part: number, whole: number): Core {
  const ratio = rat(part, whole);
  const pct = mul(ratio, PERCENT);
  const pctNumber = toPercentNumber(ratio) as string;
  return {
    concept: pctConcept(pctNumber),
    prompt: `${part} is what percentage of ${whole}?`,
    answerFormat: { kind: "number", unit: "percent" },
    answerText: `${pctNumber}%`,
    expected: pct,
    hint: `Divide ${part} by ${whole}, then multiply by 100.`,
    explanation: `${part} ÷ ${whole} = ${decimal(ratio)}, and ${decimal(ratio)} × 100 = ${pctNumber}%.`,
  };
}

function percentChange(spec: Extract<QuestionSpec, { skill: "percentage"; exerciseType: "change" }>): Core {
  if (spec.variant === "find") {
    const { from, to } = spec;
    const rising = to > from;
    const change = Math.abs(to - from);
    const ratio = rat(change, from);
    const pctNumber = toPercentNumber(ratio) as string;
    return {
      concept: pctConcept(pctNumber),
      prompt: rising
        ? `A price rises from ${from} to ${to}. What is the percentage increase?`
        : `A price falls from ${from} to ${to}. What is the percentage decrease?`,
      answerFormat: { kind: "number", unit: "percent" },
      answerText: `${pctNumber}%`,
      expected: mul(ratio, PERCENT),
      hint: "Divide the change by the original value.",
      explanation: `The change is ${change}. ${change} ÷ ${from} = ${decimal(ratio)}, which is ${pctNumber}%.`,
    };
  }
  if (spec.variant === "multi") {
    const { base, first, second } = spec;
    const apply = (value: Rational, signedPercent: number) =>
      mul(value, add(rat(1), div(fromNumber(signedPercent), PERCENT)));
    const afterFirst = apply(rat(base), first);
    const result = apply(afterFirst, second);
    const verb = (signed: number) => (signed > 0 ? "increase" : "decrease");
    const sentence = `Start with ${base}. ${cap(verb(first))} it by ${fmt(Math.abs(first))}%, then ${verb(second)} the result by ${fmt(Math.abs(second))}%.`;
    return {
      concept: "percentage:multi",
      prompt: sentence,
      answerFormat: { kind: "number" },
      answerText: decimal(result),
      expected: result,
      hint: "Work out each change in turn; the second percentage applies to the new amount.",
      explanation: `After the first change: ${base} → ${decimal(afterFirst)}. After the second: ${decimal(afterFirst)} → ${decimal(result)}.`,
    };
  }
  const { base, percent } = spec;
  const delta = mul(div(fromNumber(percent), PERCENT), rat(base));
  const up = spec.variant === "increase";
  const result = up ? add(rat(base), delta) : sub(rat(base), delta);
  return {
    concept: pctConcept(percent),
    prompt: `${up ? "Increase" : "Decrease"} ${base} by ${fmt(percent)}%.`,
    answerFormat: { kind: "number" },
    answerText: decimal(result),
    expected: result,
    hint: `Find ${fmt(percent)}% of ${base} first, then ${up ? "add" : "subtract"} it.`,
    explanation: `${fmt(percent)}% of ${base} is ${decimal(delta)}, so ${base} ${up ? "+" : "−"} ${decimal(delta)} = ${decimal(result)}.`,
  };
}

function percentConvert(spec: Extract<QuestionSpec, { skill: "percentage"; exerciseType: "convert" }>): Core {
  const concept = pctConcept(fmt(convertPercent(spec)));
  const { value } = spec;
  switch (spec.direction) {
    case "d2p": {
      const r = parseDecimal(value) as Rational;
      const pct = toPercentNumber(r) as string;
      return {
        concept,
        prompt: `Convert ${value} to a percentage.`,
        answerFormat: { kind: "number", unit: "percent" },
        answerText: `${pct}%`,
        expected: mul(r, PERCENT),
        hint: "Move the decimal point two places to the right.",
        explanation: `Multiply by 100 (move the decimal point two places right): ${value} × 100 = ${pct}%.`,
      };
    }
    case "p2d": {
      const r = div(fromNumber(Number(value)), PERCENT);
      return {
        concept,
        prompt: `Convert ${value}% to a decimal.`,
        answerFormat: { kind: "number" },
        answerText: decimal(r),
        expected: r,
        hint: "Move the decimal point two places to the left.",
        explanation: `Divide by 100 (move the decimal point two places left): ${value} ÷ 100 = ${decimal(r)}.`,
      };
    }
    case "p2f": {
      const r = div(fromNumber(Number(value)), PERCENT);
      return {
        concept,
        prompt: `Convert ${value}% to a simplified fraction.`,
        answerFormat: { kind: "fraction", lowestTerms: true },
        answerText: toFractionString(r),
        expected: r,
        hint: `Write ${value}% as ${value}/100, then simplify.`,
        explanation: `${value}% = ${value}/100, which simplifies to ${toFractionString(r)}.`,
      };
    }
    case "f2p": {
      const f = parseFraction(value) as { n: number; d: number };
      const r = rat(f.n, f.d);
      const pct = toPercentNumber(r) as string;
      return {
        concept,
        prompt: `Convert ${value} to a percentage.`,
        answerFormat: { kind: "number", unit: "percent" },
        answerText: `${pct}%`,
        expected: mul(r, PERCENT),
        hint: "Divide the numerator by the denominator, then multiply by 100.",
        explanation: `${f.n} ÷ ${f.d} = ${decimal(r)}, and ${decimal(r)} × 100 = ${pct}%.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Fractions
// ---------------------------------------------------------------------------

function fractionSimplify(num: number, den: number): Core {
  const g = gcd(num, den);
  const answer = `${num / g}/${den / g}`;
  return {
    concept: `fraction:${answer}`,
    prompt: `Simplify ${num}/${den}.`,
    answerFormat: { kind: "fraction", lowestTerms: true },
    answerText: answer,
    expected: rat(num, den),
    hint: `Find a number that divides both ${num} and ${den}.`,
    explanation: `The greatest common factor of ${num} and ${den} is ${g}. Dividing both by ${g} gives ${answer}.`,
  };
}

function fractionOf(num: number, den: number, base: number): Core {
  const answer = mul(rat(num, den), rat(base));
  const ans = decimal(answer);
  const divisible = base % den === 0;
  return {
    concept: `fraction:${num}/${den}`,
    prompt: `What is ${num}/${den} of ${base}?`,
    answerFormat: { kind: "number" },
    answerText: ans,
    expected: answer,
    hint: `Divide ${base} by ${den} first, then multiply by ${num}.`,
    explanation: divisible
      ? `${base} ÷ ${den} = ${base / den}, and ${base / den} × ${num} = ${ans}.`
      : `${base} × ${num} = ${base * num}, and ${base * num} ÷ ${den} = ${ans}.`,
  };
}

function fractionCompare(variant: "larger" | "relation", a: string, b: string): Core {
  const fa = parseFraction(a) as { n: number; d: number };
  const fb = parseFraction(b) as { n: number; d: number };
  const common = lcm(fa.d, fb.d);
  const na = (fa.n * common) / fa.d;
  const nb = (fb.n * common) / fb.d;
  // Same concept whichever order (and variant) the two fractions come in.
  const ordered = na === nb ? [a, b].sort() : na < nb ? [a, b] : [b, a];
  const concept = `fraction:compare:${ordered.join("|")}`;
  const lead = `With a common denominator of ${common}, ${a} = ${na}/${common} and ${b} = ${nb}/${common}.`;
  const hint = "Rewrite both fractions over a common denominator.";
  if (variant === "larger") {
    const larger = na > nb ? a : b;
    const choices: Choice[] = [
      { value: a, label: a },
      { value: b, label: b },
    ];
    return {
      concept,
      prompt: `Which is larger: ${a} or ${b}?`,
      answerFormat: { kind: "choice" },
      choices,
      answerText: larger,
      expected: larger,
      hint,
      explanation: `${lead} Since ${Math.max(na, nb)} is more than ${Math.min(na, nb)}, ${larger} is larger.`,
    };
  }
  const value = na > nb ? "gt" : na < nb ? "lt" : "eq";
  const choices: Choice[] = [
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "eq", label: "Equal to" },
  ];
  const label = choices.find((c) => c.value === value)!.label;
  return {
    concept,
    prompt: `Is ${a} greater than, less than, or equal to ${b}?`,
    answerFormat: { kind: "choice" },
    choices,
    answerText: label,
    expected: value,
    hint,
    explanation: `${lead} ${na} is ${label.toLowerCase()} ${nb}, so ${a} is ${label.toLowerCase()} ${b}.`,
  };
}

function fractionConvert(spec: Extract<QuestionSpec, { skill: "fraction"; exerciseType: "convert" }>): Core {
  const { value } = spec;
  switch (spec.direction) {
    case "f2d": {
      const f = parseFraction(value) as { n: number; d: number };
      const r = rat(f.n, f.d);
      return {
        concept: `fraction:${value}`,
        prompt: `Convert ${value} to a decimal.`,
        answerFormat: { kind: "number" },
        answerText: decimal(r),
        expected: r,
        hint: "Divide the numerator by the denominator.",
        explanation: `${f.n} ÷ ${f.d} = ${decimal(r)}.`,
      };
    }
    case "f2p": {
      const f = parseFraction(value) as { n: number; d: number };
      const r = rat(f.n, f.d);
      const pct = toPercentNumber(r) as string;
      return {
        concept: `fraction:${value}`,
        prompt: `Convert ${value} to a percentage.`,
        answerFormat: { kind: "number", unit: "percent" },
        answerText: `${pct}%`,
        expected: mul(r, PERCENT),
        hint: "Divide the numerator by the denominator, then multiply by 100.",
        explanation: `${f.n} ÷ ${f.d} = ${decimal(r)}, and ${decimal(r)} × 100 = ${pct}%.`,
      };
    }
    case "d2f": {
      const r = parseDecimal(value) as Rational;
      const places = value.includes(".") ? value.length - value.indexOf(".") - 1 : 0;
      const digits = value.replace(".", "").replace(/^0+(?=\d)/, "");
      const answer = toFractionString(r);
      return {
        concept: `fraction:${answer}`,
        prompt: `Convert ${value} to a simplified fraction.`,
        answerFormat: { kind: "fraction", lowestTerms: true },
        answerText: answer,
        expected: r,
        hint: "Write it over a power of ten, then simplify.",
        explanation: `${value} = ${digits}/${10 ** places}, which simplifies to ${answer}.`,
      };
    }
    case "p2f": {
      const r = div(fromNumber(Number(value)), PERCENT);
      return {
        concept: `fraction:${toFractionString(r)}`,
        prompt: `Convert ${value}% to a simplified fraction.`,
        answerFormat: { kind: "fraction", lowestTerms: true },
        answerText: toFractionString(r),
        expected: r,
        hint: `Write ${value}% as ${value}/100, then simplify.`,
        explanation: `${value}% = ${value}/100, which simplifies to ${toFractionString(r)}.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Squares
// ---------------------------------------------------------------------------

function squareWorking(n: number): string {
  const sq = n * n;
  if (n < 10) return `${n}² = ${n} × ${n} = ${sq}.`;
  if (n % 10 === 0) return `${n} = ${n / 10} × 10, so ${n}² = ${(n / 10) ** 2} × 100 = ${sq}.`;
  if (n % 10 === 5) {
    const tens = (n - 5) / 10;
    return `For numbers ending in 5: ${tens} × ${tens + 1} = ${tens * (tens + 1)}, then append 25 to get ${sq}.`;
  }
  const a = Math.floor(n / 10) * 10;
  const b = n - a;
  return `${n}² = (${a} + ${b})² = ${a * a} + ${2 * a * b} + ${b * b} = ${sq}.`;
}

const ROOT_ENDINGS: Record<number, string> = { 0: "0", 1: "1 or 9", 4: "2 or 8", 5: "5", 6: "4 or 6", 9: "3 or 7" };

function squareCore(spec: Extract<QuestionSpec, { skill: "square" }>): Core {
  const { n } = spec;
  const sq = n * n;
  const concept = `square:${n}`;
  const rootExplanation = `${n} × ${n} = ${sq}, so √${sq} = ${n}.`;
  const rootHint = `A square ending in ${sq % 10} has a root ending in ${ROOT_ENDINGS[sq % 10]}.`;
  switch (spec.exerciseType) {
    case "value":
      return {
        concept,
        prompt: `${n}²`,
        answerFormat: { kind: "integer" },
        answerText: String(sq),
        expected: rat(sq),
        hint: n >= 10 ? "Split the number into tens and units." : `Multiply ${n} by itself.`,
        explanation: squareWorking(n),
      };
    case "root":
      return {
        concept,
        prompt: `√${sq}`,
        answerFormat: { kind: "integer" },
        answerText: String(n),
        expected: rat(n),
        hint: rootHint,
        explanation: rootExplanation,
      };
    case "missing":
      return spec.variant === "product"
        ? {
            concept,
            prompt: `${n} × ${n} = ?`,
            answerFormat: { kind: "integer" },
            answerText: String(sq),
            expected: rat(sq),
            hint: `This is ${n}².`,
            explanation: squareWorking(n),
          }
        : {
            concept,
            prompt: `?² = ${sq}`,
            answerFormat: { kind: "integer" },
            answerText: String(n),
            expected: rat(n),
            hint: rootHint,
            explanation: rootExplanation,
          };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function buildCore(spec: QuestionSpec): Core {
  switch (spec.skill) {
    case "multiplication":
      return multiplication(spec.left, spec.right);
    case "percentage":
      switch (spec.exerciseType) {
        case "of":
          return percentOf(spec.percent, spec.base);
        case "what":
          return percentWhat(spec.part, spec.whole);
        case "change":
          return percentChange(spec);
        case "convert":
          return percentConvert(spec);
      }
      break;
    case "fraction":
      switch (spec.exerciseType) {
        case "simplify":
          return fractionSimplify(spec.num, spec.den);
        case "of":
          return fractionOf(spec.num, spec.den, spec.base);
        case "compare":
          return fractionCompare(spec.variant, spec.a, spec.b);
        case "convert":
          return fractionConvert(spec);
      }
      break;
    case "square":
      return squareCore(spec);
  }
  throw new Error("Unreachable question spec");
}

export function buildQuestion(spec: QuestionSpec): Question {
  return { ...spec, id: idOfSpec(spec), difficulty: difficultyOfSpec(spec), ...buildCore(spec) } as Question;
}

/** Rebuilds a question from its id, or null if the id is not a valid question. */
export function questionFromId(id: unknown): Question | null {
  const spec = parseQuestionId(id);
  return spec ? buildQuestion(spec) : null;
}

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    skill: q.skill,
    exerciseType: q.exerciseType,
    difficulty: q.difficulty,
    prompt: q.prompt,
    answerFormat: q.answerFormat,
    ...(q.choices ? { choices: q.choices } : {}),
    ...(q.hint ? { hint: q.hint } : {}),
  };
}
