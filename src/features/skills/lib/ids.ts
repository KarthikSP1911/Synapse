import type { QuestionSpec } from "./types";
import { idOfExponentSpec, parseExponentSpec } from "./exponents";
import { decimalPlaces, gcd, isTerminating, mul, parseDecimal, PERCENT, rat, type Rational } from "./rational";

/**
 * Stable question ids. Every id is derived from the spec and parses back to exactly that spec,
 * so the server can rebuild a question (and its correct answer) from an id sent by the browser
 * instead of trusting operands or answers from the client.
 *
 *   multiplication:12:8            percentage:of:25:80          percentage:what:15:60
 *   addition:47:38                 subtraction:23:58            division:15:4
 *   percentage:change:increase:200:15    percentage:change:decrease:400:25
 *   percentage:change:find:80:100        percentage:change:multi:200:10:-10
 *   percentage:convert:d2p:0.75          fraction:simplify:12:16
 *   fraction:of:3/4:80                   fraction:compare:larger:3/4:2/3
 *   fraction:convert:f2d:1/4             square:value:17   square:root:289
 *   square:missing:product:14            square:missing:base:441
 *   exponents:p:mul-law:std:2:5:7        exponents:v:evaluate:std:2:5
 */

export const MAX_BASE = 10000;
/** Largest operand of an addition, subtraction or division question (four digits). */
export const MAX_OPERAND_VALUE = 9999;
const MAX_PERCENT = 500;

/** Formats a number that only ever has a couple of decimals, exactly as it appears in ids. */
export const fmt = (x: number): string => String(x);

function parseInt1(token: string | undefined, min: number, max: number): number | null {
  if (token === undefined || !/^\d+$/.test(token)) return null;
  const n = Number(token);
  return n >= min && n <= max && String(n) === token ? n : null;
}

/** Canonical non-negative decimal with at most `places` decimals ("12.5", never "12.50" or ".5"). */
function parseDec(token: string | undefined, places: number, min: number, max: number): number | null {
  if (token === undefined || !new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(token)) return null;
  const n = Number(token);
  return n >= min && n <= max && String(n) === token ? n : null;
}

function parseSigned(token: string | undefined): number | null {
  if (token === undefined) return null;
  const negative = token.startsWith("-");
  const value = parseDec(negative ? token.slice(1) : token, 2, 0.01, MAX_PERCENT);
  return value === null ? null : negative ? -value : value;
}

export function parseFraction(token: string | undefined): { n: number; d: number } | null {
  const match = token === undefined ? null : /^([1-9]\d{0,3})\/([1-9]\d{0,3})$/.exec(token);
  if (!match) return null;
  const n = Number(match[1]);
  const d = Number(match[2]);
  return d >= 2 ? { n, d } : null;
}

const inLowestTerms = (f: { n: number; d: number }) => gcd(f.n, f.d) === 1;

/** A decimal id token as an exact rational, only if it has a canonical form with <= 4 places. */
function decimalToken(token: string | undefined): Rational | null {
  if (parseDec(token, 4, 0.0001, MAX_BASE) === null) return null;
  return parseDecimal(token as string);
}

/** True when the rational is a clean, ending decimal (so an exact answer can be typed). */
const endsCleanly = (r: Rational, maxPlaces = 4) => {
  if (!isTerminating(r)) return false;
  const places = decimalPlaces(r);
  return places !== null && places <= maxPlaces;
};

export function idOfSpec(spec: QuestionSpec): string {
  switch (spec.skill) {
    case "multiplication":
      return `multiplication:${spec.left}:${spec.right}`;
    case "addition":
      return `addition:${spec.left}:${spec.right}`;
    case "subtraction":
      return `subtraction:${spec.left}:${spec.right}`;
    case "division":
      return `division:${spec.dividend}:${spec.divisor}`;
    case "percentage":
      switch (spec.exerciseType) {
        case "of":
          return `percentage:of:${fmt(spec.percent)}:${spec.base}`;
        case "what":
          return `percentage:what:${spec.part}:${spec.whole}`;
        case "change":
          switch (spec.variant) {
            case "increase":
            case "decrease":
              return `percentage:change:${spec.variant}:${spec.base}:${fmt(spec.percent)}`;
            case "find":
              return `percentage:change:find:${spec.from}:${spec.to}`;
            case "multi":
              return `percentage:change:multi:${spec.base}:${fmt(spec.first)}:${fmt(spec.second)}`;
          }
        case "convert":
          return `percentage:convert:${spec.direction}:${spec.value}`;
      }
    case "fraction":
      switch (spec.exerciseType) {
        case "simplify":
          return `fraction:simplify:${spec.num}:${spec.den}`;
        case "of":
          return `fraction:of:${spec.num}/${spec.den}:${spec.base}`;
        case "compare":
          return `fraction:compare:${spec.variant}:${spec.a}:${spec.b}`;
        case "convert":
          return `fraction:convert:${spec.direction}:${spec.value}`;
      }
    case "square":
      switch (spec.exerciseType) {
        case "value":
          return `square:value:${spec.n}`;
        case "root":
          return `square:root:${spec.n * spec.n}`;
        case "missing":
          return spec.variant === "product"
            ? `square:missing:product:${spec.n}`
            : `square:missing:base:${spec.n * spec.n}`;
      }
    case "exponents":
      return idOfExponentSpec(spec);
  }
}

function perfectSquareRoot(s: number | null): number | null {
  if (s === null) return null;
  const root = Math.round(Math.sqrt(s));
  return root >= 1 && root <= 100 && root * root === s ? root : null;
}

function parseSpec(parts: string[]): QuestionSpec | null {
  const [skill, type, ...rest] = parts;
  switch (skill) {
    case "multiplication": {
      // multiplication:<left>:<right>; `type` holds the left operand.
      const left = parseInt1(type, 1, 20);
      const right = parseInt1(rest[0], 1, 20);
      return left !== null && right !== null && rest.length === 1
        ? { skill, exerciseType: "multiply", left, right }
        : null;
    }
    case "addition":
    case "subtraction": {
      // <skill>:<left>:<right>; `type` holds the left operand.
      const left = parseInt1(type, 1, MAX_OPERAND_VALUE);
      const right = parseInt1(rest[0], 1, MAX_OPERAND_VALUE);
      if (left === null || right === null || rest.length !== 1) return null;
      if (skill === "addition") return { skill, exerciseType: "add", left, right };
      return left !== right ? { skill, exerciseType: "subtract", left, right } : null;
    }
    case "division": {
      // division:<dividend>:<divisor>; `type` holds the dividend.
      const dividend = parseInt1(type, 3, MAX_OPERAND_VALUE);
      const divisor = parseInt1(rest[0], 2, 999);
      if (dividend === null || divisor === null || rest.length !== 1 || dividend <= divisor) return null;
      return endsCleanly(rat(dividend, divisor), 2) ? { skill, exerciseType: "divide", dividend, divisor } : null;
    }
    case "percentage": {
      switch (type) {
        case "of": {
          const percent = parseDec(rest[0], 2, 0.01, MAX_PERCENT);
          const base = parseInt1(rest[1], 1, MAX_BASE);
          return percent !== null && base !== null && rest.length === 2
            ? { skill, exerciseType: "of", percent, base }
            : null;
        }
        case "what": {
          const part = parseInt1(rest[0], 1, MAX_BASE * 10);
          const whole = parseInt1(rest[1], 1, MAX_BASE);
          if (part === null || whole === null || rest.length !== 2) return null;
          return endsCleanly(mul(rat(part, whole), PERCENT)) ? { skill, exerciseType: "what", part, whole } : null;
        }
        case "change": {
          const [variant, ...args] = rest;
          if (variant === "increase" || variant === "decrease") {
            const base = parseInt1(args[0], 1, MAX_BASE);
            const percent = parseDec(args[1], 2, 0.01, variant === "decrease" ? 99.99 : MAX_PERCENT);
            return base !== null && percent !== null && args.length === 2
              ? { skill, exerciseType: "change", variant, base, percent }
              : null;
          }
          if (variant === "find") {
            const from = parseInt1(args[0], 1, MAX_BASE);
            const to = parseInt1(args[1], 1, MAX_BASE * 10);
            if (from === null || to === null || from === to || args.length !== 2) return null;
            const change = mul(rat(Math.abs(to - from), from), PERCENT);
            return endsCleanly(change) ? { skill, exerciseType: "change", variant, from, to } : null;
          }
          if (variant === "multi") {
            const base = parseInt1(args[0], 1, MAX_BASE);
            const first = parseSigned(args[1]);
            const second = parseSigned(args[2]);
            if (base === null || first === null || second === null || args.length !== 3) return null;
            if (first <= -100 || second <= -100) return null;
            return { skill, exerciseType: "change", variant, base, first, second };
          }
          return null;
        }
        case "convert": {
          const [direction, value] = rest;
          if (rest.length !== 2) return null;
          if (direction === "d2p") {
            const dec = decimalToken(value);
            return dec ? { skill, exerciseType: "convert", direction, value: value } : null;
          }
          if (direction === "p2d" || direction === "p2f") {
            const percent = parseDec(value, 2, 0.01, MAX_PERCENT);
            if (percent === null) return null;
            // Whole-number results make a poor "simplified fraction" exercise.
            if (direction === "p2f" && percent % 100 === 0) return null;
            return { skill, exerciseType: "convert", direction, value: fmt(percent) };
          }
          if (direction === "f2p") {
            const f = parseFraction(value);
            if (!f || !inLowestTerms(f) || !endsCleanly(mul(rat(f.n, f.d), PERCENT))) return null;
            return { skill, exerciseType: "convert", direction, value: `${f.n}/${f.d}` };
          }
          return null;
        }
      }
      return null;
    }
    case "fraction": {
      switch (type) {
        case "simplify": {
          const num = parseInt1(rest[0], 1, 1000);
          const den = parseInt1(rest[1], 2, 1000);
          if (num === null || den === null || rest.length !== 2) return null;
          const g = gcd(num, den);
          return g > 1 && den / g >= 2 ? { skill, exerciseType: "simplify", num, den } : null;
        }
        case "of": {
          const f = parseFraction(rest[0]);
          const base = parseInt1(rest[1], 1, MAX_BASE);
          if (!f || base === null || rest.length !== 2 || !inLowestTerms(f)) return null;
          return endsCleanly(mul(rat(f.n, f.d), rat(base)), 2)
            ? { skill, exerciseType: "of", num: f.n, den: f.d, base }
            : null;
        }
        case "compare": {
          const [variant, a, b] = rest;
          const fa = parseFraction(a);
          const fb = parseFraction(b);
          if ((variant !== "larger" && variant !== "relation") || !fa || !fb || rest.length !== 3 || a === b) return null;
          if (variant === "larger") {
            if (!inLowestTerms(fa) || !inLowestTerms(fb)) return null;
            if (fa.n * fb.d === fb.n * fa.d) return null; // equal values have no "larger"
          }
          return { skill, exerciseType: "compare", variant, a: a as string, b: b as string };
        }
        case "convert": {
          const [direction, value] = rest;
          if (rest.length !== 2) return null;
          if (direction === "f2d" || direction === "f2p") {
            const f = parseFraction(value);
            // Both the decimal and the percentage form must be short enough to type exactly.
            if (!f || !inLowestTerms(f) || !endsCleanly(rat(f.n, f.d)) || !endsCleanly(mul(rat(f.n, f.d), PERCENT))) return null;
            return { skill, exerciseType: "convert", direction, value: `${f.n}/${f.d}` };
          }
          if (direction === "d2f") {
            const dec = decimalToken(value);
            return dec && dec.d !== BigInt(1) ? { skill, exerciseType: "convert", direction, value: value as string } : null;
          }
          if (direction === "p2f") {
            const percent = parseDec(value, 2, 0.01, MAX_PERCENT);
            return percent !== null && percent % 100 !== 0
              ? { skill, exerciseType: "convert", direction, value: fmt(percent) }
              : null;
          }
          return null;
        }
      }
      return null;
    }
    case "exponents":
      return parseExponentSpec(parts);
    case "square": {
      switch (type) {
        case "value": {
          const n = parseInt1(rest[0], 1, 100);
          return n !== null && rest.length === 1 ? { skill, exerciseType: "value", n } : null;
        }
        case "root": {
          const n = perfectSquareRoot(parseInt1(rest[0], 1, 10000));
          return n !== null && rest.length === 1 ? { skill, exerciseType: "root", n } : null;
        }
        case "missing": {
          const [variant, token] = rest;
          if (rest.length !== 2) return null;
          if (variant === "product") {
            const n = parseInt1(token, 1, 100);
            return n !== null ? { skill, exerciseType: "missing", variant, n } : null;
          }
          if (variant === "base") {
            const n = perfectSquareRoot(parseInt1(token, 1, 10000));
            return n !== null ? { skill, exerciseType: "missing", variant, n } : null;
          }
          return null;
        }
      }
      return null;
    }
  }
  return null;
}

/** Parses an id back into its spec, or null if it is malformed, out of range or not canonical. */
export function parseQuestionId(id: unknown): QuestionSpec | null {
  if (typeof id !== "string" || id.length > 80) return null;
  const spec = parseSpec(id.split(":"));
  return spec && idOfSpec(spec) === id ? spec : null;
}
