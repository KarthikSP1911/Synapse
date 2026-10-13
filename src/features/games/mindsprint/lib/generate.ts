import { div, rat, toDecimalString, type Rational } from "@/features/skills/lib/rational";
import { applyOperation, evaluateSequence, parseValue, totalFits } from "./arithmetic";
import { magnitudeCap, placesOf } from "./config";
import type { Flash, GeneratedRound, Operation, RoundConfig } from "./types";

/** Source of randomness in [0, 1); injectable so tests can replay a sequence. */
export type Rng = () => number;

/** A round that cannot be built from its settings (for example only division with big numbers). */
export class GenerationError extends Error {
  constructor(
    message: string,
    /** Zero-based index of the round that failed, when generating a whole session. */
    readonly round?: number
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

const MAX_ATTEMPTS = 300;
const TRIES_PER_STEP = 40;
/** Chance that a number gets decimal places, when decimals are on. */
const DECIMAL_SHARE = 0.7;
/** Chance that a number is negative, when negatives are on. */
const NEGATIVE_SHARE = 0.35;
/** Beyond this the divisors of a running total are found by sampling instead of by trial division. */
const DIVISOR_SCAN_LIMIT = 1e10;

const ZERO = BigInt(0);

const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const wholeRange = (config: RoundConfig) => ({ lo: config.digits === 1 ? 1 : 10 ** (config.digits - 1), hi: 10 ** config.digits - 1 });

const fromString = (text: string): Rational => parseValue(text) as Rational;
const negate = (r: Rational): Rational => rat(-r.n, r.d);
const abs = (r: Rational): Rational => (r.n < ZERO ? negate(r) : r);

/**
 * A random number for the round: a whole part with exactly `digits` digits (never zero), sometimes followed by
 * up to `decimalPlaces` decimals ending in a non-zero digit, and sometimes negative. `maxWhole` caps the whole
 * part, which lets a multiplication stay within the size limit instead of being rejected over and over.
 */
function randomOperand(config: RoundConfig, rng: Rng, { integerOnly = false, maxWhole = Infinity } = {}): Rational | null {
  const { lo, hi: fullHi } = wholeRange(config);
  const hi = Math.min(fullHi, maxWhole);
  if (hi < lo) return null;
  let text = String(randInt(rng, lo, hi));
  const places = placesOf(config);
  if (places > 0 && !integerOnly && rng() < DECIMAL_SHARE) {
    const count = randInt(rng, 1, places);
    let fraction = "";
    for (let i = 0; i < count - 1; i++) fraction += randInt(rng, 0, 9);
    text += `.${fraction}${randInt(rng, 1, 9)}`;
  }
  const value = fromString(text);
  return config.allowNegative && rng() < NEGATIVE_SHARE ? negate(value) : value;
}

/** Positive whole divisors of `n` within [lo, hi], by trial division up to the square root. */
function divisorsInRange(n: number, lo: number, hi: number): number[] {
  const found: number[] = [];
  for (let d = 1; d * d <= n; d++) {
    if (n % d !== 0) continue;
    const other = n / d;
    if (d >= lo && d <= hi) found.push(d);
    if (other !== d && other >= lo && other <= hi) found.push(other);
  }
  return found;
}

/**
 * A divisor that divides the running total exactly, within the decimal places the round allows. With the total
 * written as N / 10^places for a whole N, the quotient has at most that many places exactly when the divisor
 * divides N, so the candidates can be listed instead of guessed.
 */
function divisorFor(total: Rational, config: RoundConfig, rng: Rng, relaxed: boolean): Rational | null {
  const { lo, hi } = wholeRange(config);
  const scaled = abs(total).n * BigInt(10) ** BigInt(placesOf(config)) / abs(total).d;
  let candidates: number[];
  if (scaled === ZERO) {
    // Zero divided by anything is zero.
    candidates = Array.from({ length: Math.min(hi - lo + 1, 12) }, () => randInt(rng, lo, hi));
  } else if (scaled <= BigInt(DIVISOR_SCAN_LIMIT)) {
    candidates = divisorsInRange(Number(scaled), lo, hi);
  } else {
    candidates = [];
  }
  // Dividing by 1 changes nothing: only used when nothing else fits.
  const useful = relaxed ? candidates : candidates.filter((d) => d !== 1);
  if (useful.length === 0) return null;
  const divisor = fromString(String(useful[randInt(rng, 0, useful.length - 1)]));
  return config.allowNegative && rng() < NEGATIVE_SHARE ? negate(divisor) : divisor;
}

const isOne = (r: Rational) => abs(r).n === BigInt(1) && r.d === BigInt(1);

/** The next number for `op` after `total`, chosen so the new total stays within the round's limits; null if none was found. */
function nextOperand(op: Operation, total: Rational, config: RoundConfig, rng: Rng, relaxed: boolean): Rational | null {
  const fits = (result: Rational | null) => result !== null && totalFits(result, config);

  if (op === "divide") {
    const divisor = divisorFor(total, config, rng, relaxed);
    return divisor && fits(div(total, divisor)) ? divisor : null;
  }
  for (let i = 0; i < TRIES_PER_STEP; i++) {
    let operand: Rational | null;
    if (op === "multiply") {
      // Keep the product under the cap by capping the number, and fall back to whole numbers, which cannot add decimal places.
      const room = Math.floor(magnitudeCap(config.digits) / Math.max(1, Math.ceil(Number(abs(total).n) / Number(abs(total).d))));
      operand = randomOperand(config, rng, { integerOnly: i >= TRIES_PER_STEP * 0.6, maxWhole: room });
      if (operand && !relaxed && isOne(operand)) continue;
    } else {
      operand = randomOperand(config, rng);
    }
    if (!operand) return null;
    if (fits(applyOperation(op, total, operand))) return operand;
  }
  return null;
}

/** One attempt at a whole sequence; null when it paints itself into a corner. */
function attempt(config: RoundConfig, rng: Rng): Flash[] | null {
  const first = randomOperand(config, rng);
  if (!first || !totalFits(first, config)) return null;
  const flashes: Flash[] = [{ op: null, value: toDecimalString(first) as string }];
  const used = new Map<Operation, number>(config.operations.map((op) => [op, 0]));
  let total = first;

  while (flashes.length < config.flashes) {
    // Least-used operations first (with some noise) so every enabled operation shows up in a long sequence.
    const order = shuffled(config.operations, rng)
      .map((op) => ({ op, key: (used.get(op) as number) + rng() * 1.2 }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.op);
    let placed = false;
    for (const relaxed of [false, true]) {
      for (const op of order) {
        const operand = nextOperand(op, total, config, rng, relaxed);
        if (!operand) continue;
        const next = applyOperation(op, total, operand) as Rational;
        flashes.push({ op, value: toDecimalString(operand) as string });
        used.set(op, (used.get(op) as number) + 1);
        total = next;
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) return null;
  }
  return flashes;
}

/**
 * Builds and verifies one round. The returned sequence is complete and has been evaluated: it is the one and
 * only sequence used for the flashes, the answer check, the score and the results screen.
 */
export function generateRound(config: RoundConfig, rng: Rng = Math.random): GeneratedRound {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const flashes = attempt(config, rng);
    if (flashes && evaluateSequence(flashes).ok) return { config, flashes };
  }
  throw new GenerationError("No valid sequence can be built with these settings. Try fewer numbers or digits, or turn on another operation (division on its own, or multiplying big numbers repeatedly, runs out of room).");
}

/** Builds every round of a session up front, so a setup that cannot work is reported before the first countdown. */
export function generateSession(configs: readonly RoundConfig[], rng: Rng = Math.random): GeneratedRound[] {
  return configs.map((config, index) => {
    try {
      return generateRound(config, rng);
    } catch (error) {
      if (error instanceof GenerationError) throw new GenerationError(`Round ${index + 1}: ${error.message}`, index);
      throw error;
    }
  });
}

/** A small seeded generator (mulberry32) for repeatable tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
