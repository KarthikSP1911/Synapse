/**
 * Exact rational arithmetic for answer checking and question generation.
 *
 * Values are held as a reduced fraction of BigInts so that "0.1 + 0.2", "12.5% of 160" and
 * "1/8 as a percentage" are all computed without floating-point error. BigInt() calls are
 * used instead of literals because the project targets ES2017.
 */

export interface Rational {
  readonly n: bigint;
  /** Always positive. */
  readonly d: bigint;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const FIVE = BigInt(5);
const TEN = BigInt(10);
const HUNDRED = BigInt(100);

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) [x, y] = [y, x % y];
  return x;
}

/** Builds a reduced rational. Throws on a zero denominator: generators must never produce one. */
export function rat(n: number | bigint, d: number | bigint = 1): Rational {
  const nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === ZERO) throw new RangeError("Rational with zero denominator");
  let num = nn;
  if (dd < ZERO) {
    num = -num;
    dd = -dd;
  }
  const g = gcdBig(num, dd);
  return g === ZERO || g === ONE ? { n: num, d: dd } : { n: num / g, d: dd / g };
}

export const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export function div(a: Rational, b: Rational): Rational {
  if (b.n === ZERO) throw new RangeError("Division by zero");
  return rat(a.n * b.d, a.d * b.n);
}

export const cmp = (a: Rational, b: Rational): -1 | 0 | 1 => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};
export const eq = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d;
export const isInteger = (a: Rational) => a.d === ONE;
export const isLowestTerms = (n: bigint, d: bigint) => d > ZERO && gcdBig(n, d) === ONE;

/** gcd for plain numbers (generators and explanations). */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** True when the reduced denominator only has factors of 2 and 5, i.e. the decimal expansion ends. */
export function isTerminating(a: Rational): boolean {
  let d = a.d;
  while (d % TWO === ZERO) d /= TWO;
  while (d % FIVE === ZERO) d /= FIVE;
  return d === ONE;
}

/** Number of digits after the decimal point, or null when the expansion never ends. */
export function decimalPlaces(a: Rational): number | null {
  if (!isTerminating(a)) return null;
  // Smallest power of ten the denominator divides; terminating guarantees this ends.
  let places = 0;
  let power = ONE;
  while (power % a.d !== ZERO) {
    power *= TEN;
    places += 1;
  }
  return places;
}

/** Exact decimal string ("0.125", "20", "-1.5"), or null when the decimal does not terminate. */
export function toDecimalString(a: Rational): string | null {
  const places = decimalPlaces(a);
  if (places === null) return null;
  const negative = a.n < ZERO;
  const abs = negative ? -a.n : a.n;
  const scale = TEN ** BigInt(places);
  const scaled = (abs * scale) / a.d; // exact: d divides 10^places
  let digits = scaled.toString();
  if (places > 0) {
    digits = digits.padStart(places + 1, "0");
    digits = `${digits.slice(0, digits.length - places)}.${digits.slice(digits.length - places)}`;
  }
  return negative ? `-${digits}` : digits;
}

/** "3/4", or just "5" for whole numbers. */
export function toFractionString(a: Rational): string {
  return a.d === ONE ? a.n.toString() : `${a.n}/${a.d}`;
}

/** A rational as a percentage string without the sign: 1/8 -> "12.5". Null if it never terminates. */
export function toPercentNumber(a: Rational): string | null {
  return toDecimalString(mul(a, rat(HUNDRED)));
}

/**
 * Parses a plain decimal literal such as "12", "0.50", ".5", "12.5". No signs, exponents,
 * separators or fractions. Length limits keep every later product within BigInt-friendly size.
 */
export function parseDecimal(text: string): Rational | null {
  const match = /^(\d{0,9})(?:\.(\d{1,9}))?$/.exec(text);
  if (!match || (match[1] === "" && match[2] === undefined)) return null;
  const whole = match[1] === "" ? "0" : match[1];
  const frac = match[2] ?? "";
  return rat(BigInt(whole + frac), TEN ** BigInt(frac.length));
}

/** Converts a JS number that is known to have only a few decimals (e.g. 12.5) into a rational. */
export function fromNumber(value: number): Rational {
  const negative = value < 0;
  const parsed = parseDecimal(String(negative ? -value : value));
  if (!parsed) throw new RangeError(`Cannot convert ${value} exactly`);
  return negative ? rat(-parsed.n, parsed.d) : parsed;
}

export const PERCENT = rat(HUNDRED);
