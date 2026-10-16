import { seededRng, type Rng } from "@/lib/random";
import { sessionTrials } from "./config";
import { fixedCell, domainSize } from "./stimuli";
import { MATCH_RATE, STREAMS, type NBackConfig, type StreamId, type Trial } from "./types";

/**
 * The sequence generator. Given a seed and the settings it always produces the same trials, and it records for
 * every active stream which trials are matches, so scoring never has to look at the screen.
 *
 * Each active stream is generated on its own, from its own random stream (derived from the seed), so turning another
 * stream on or off never changes it, and a trial can match in none, one or several streams.
 *
 * Rules, in order of importance:
 *  1. A trial `t` is a match when its value equals the value of trial `t - n`. The first n trials are never matches.
 *  2. About `MATCH_RATE` of the scoreable trials match, within a tolerance, and a stream never has zero or all.
 *  3. No value appears three times in a row.
 *  4. A non-match avoids the values one step either side of the matching trial (the n - 1 and n + 1 "near misses"),
 *     which would be confusing, whenever the value set is big enough to allow it.
 */

/** The share of scoreable trials that match may be this far below or above the target. */
export const MATCH_TOLERANCE = { min: 0.15, max: 0.35 } as const;
const MAX_ATTEMPTS = 60;
/** A value may repeat on consecutive trials, but never three times. */
const MAX_RUN = 2;

export interface GenerateParams {
  seed: number;
  trials: number;
  n: number;
  streams: Record<StreamId, boolean>;
  grid: number;
  colors: number;
  letters: number;
}

export const paramsFromConfig = (config: NBackConfig, seed: number): GenerateParams => ({
  seed,
  trials: sessionTrials(config),
  n: config.n,
  streams: config.streams,
  grid: config.grid,
  colors: config.colors,
  letters: config.letters,
});

/** How many of the `scoreable` trials match: about the target rate, a little varied, within tolerance, never none or all. */
export function matchCount(scoreable: number, rng: Rng): number {
  if (scoreable < 2) return 0;
  const lowest = Math.max(1, Math.ceil(scoreable * MATCH_TOLERANCE.min));
  const highest = Math.max(lowest, Math.min(scoreable - 1, Math.floor(scoreable * MATCH_TOLERANCE.max)));
  const nudge = [-1, 0, 0, 1][Math.floor(rng() * 4)];
  return Math.min(highest, Math.max(lowest, Math.round(scoreable * MATCH_RATE) + nudge));
}

/** `count` distinct indices from `from` up to (not including) `to`, in order. */
function sampleIndices(from: number, to: number, count: number, rng: Rng): number[] {
  const pool = Array.from({ length: to - from }, (_, i) => from + i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export function longestRun(values: readonly number[]): number {
  let longest = 0;
  let run = 0;
  values.forEach((value, i) => {
    run = i > 0 && value === values[i - 1] ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

/** Non-match trials whose value equals the value one step before or after the trial n back: the confusing look-alikes. */
export function nearMissCount(values: readonly number[], n: number): number {
  let count = 0;
  for (let t = n; t < values.length; t++) {
    if (values[t] === values[t - n]) continue;
    if (t - n - 1 >= 0 && values[t] === values[t - n - 1]) count++;
    else if (n >= 2 && values[t] === values[t - n + 1]) count++;
  }
  return count;
}

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

/** One stream's values for one choice of match trials. */
function fill(size: number, trials: number, n: number, isMatch: readonly boolean[], rng: Rng): number[] {
  const values: number[] = [];
  const all = Array.from({ length: size }, (_, v) => v);
  for (let t = 0; t < trials; t++) {
    // A value that would make a run of three is avoided wherever there is a choice.
    const makesRun = (v: number) => t >= MAX_RUN && values[t - 1] === v && values[t - 2] === v;
    if (t < n) {
      values.push(pick(all.filter((v) => !makesRun(v)), rng));
      continue;
    }
    const reference = values[t - n];
    if (isMatch[t]) {
      values.push(reference);
      continue;
    }
    const others = all.filter((v) => v !== reference);
    const calm = others.filter((v) => !makesRun(v));
    const notNear = (v: number) => !(t - n - 1 >= 0 && v === values[t - n - 1]) && !(n >= 2 && v === values[t - n + 1]);
    const best = calm.filter(notNear);
    values.push(pick(best.length > 0 ? best : calm.length > 0 ? calm : others, rng));
  }
  return values;
}

/** One stream: its values and its match flags, from its own random generator. */
export function generateStream(size: number, trials: number, n: number, rng: Rng): { values: number[]; matches: boolean[] } {
  const scoreable = trials - n;
  const count = matchCount(scoreable, rng);
  let best: { values: number[]; matches: boolean[]; run: number } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const chosen = new Set(sampleIndices(n, trials, count, rng));
    const isMatch = Array.from({ length: trials }, (_, t) => chosen.has(t));
    const values = fill(size, trials, n, isMatch, rng);
    const run = longestRun(values);
    if (!best || run < best.run) best = { values, matches: isMatch, run };
    if (run <= MAX_RUN) break;
  }
  // The flags are read from the values, not from the plan, so they are the truth about what was generated.
  const { values } = best!;
  return { values, matches: values.map((v, t) => t >= n && v === values[t - n]) };
}

export function generateSequence(params: GenerateParams): Trial[] {
  const { seed, trials, n } = params;
  const fixed = fixedCell(params.grid);
  const perStream = Object.fromEntries(
    STREAMS.map((stream, index) => {
      if (!params.streams[stream]) return [stream, null];
      const rng = seededRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
      return [stream, generateStream(domainSize(stream, params), trials, n, rng)];
    })
  ) as Record<StreamId, { values: number[]; matches: boolean[] } | null>;

  return Array.from({ length: trials }, (_, t) => ({
    values: {
      position: perStream.position ? perStream.position.values[t] : fixed,
      color: perStream.color ? perStream.color.values[t] : 0,
      letter: perStream.letter ? perStream.letter.values[t] : 0,
    },
    matches: {
      position: perStream.position?.matches[t] ?? false,
      color: perStream.color?.matches[t] ?? false,
      letter: perStream.letter?.matches[t] ?? false,
    },
  }));
}
