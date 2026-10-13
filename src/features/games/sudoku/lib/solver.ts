import { ALL_DIGITS, POPCOUNT, bit, boxOf, colOf, hasConflict, rowOf } from "./grid";
import { CELLS, SIZE } from "./types";

/** Source of randomness in [0, 1); injectable so tests can replay a puzzle. */
export type Rng = () => number;

/** A small, seedable generator (mulberry32) for reproducible puzzles in tests. */
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

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Search {
  values: number[];
  rows: number[];
  cols: number[];
  boxes: number[];
  limit: number;
  rng: Rng | null;
  count: number;
  first: number[] | null;
}

/** Backtracking search that always extends the empty cell with the fewest options (the cheapest way to prune). */
function search(s: Search): void {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < CELLS; i++) {
    if (s.values[i] !== 0) continue;
    const mask = ALL_DIGITS & ~(s.rows[rowOf(i)] | s.cols[colOf(i)] | s.boxes[boxOf(i)]);
    const count = POPCOUNT[mask];
    if (count < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = count;
      if (count <= 1) break;
    }
  }

  if (best === -1) {
    s.count++;
    s.first ??= [...s.values];
    return;
  }
  if (bestCount === 0) return;

  const r = rowOf(best);
  const c = colOf(best);
  const b = boxOf(best);
  let digits: number[] = [];
  for (let d = 1; d <= SIZE; d++) if (bestMask & bit(d)) digits.push(d);
  if (s.rng) digits = shuffle(digits, s.rng);

  for (const d of digits) {
    const m = bit(d);
    s.values[best] = d;
    s.rows[r] |= m;
    s.cols[c] |= m;
    s.boxes[b] |= m;
    search(s);
    s.values[best] = 0;
    s.rows[r] &= ~m;
    s.cols[c] &= ~m;
    s.boxes[b] &= ~m;
    if (s.count >= s.limit) return;
  }
}

function run(values: readonly number[], limit: number, rng: Rng | null): { count: number; first: number[] | null } {
  if (values.length !== CELLS || hasConflict(values)) return { count: 0, first: null };
  const s: Search = { values: [...values], rows: new Array(SIZE).fill(0), cols: new Array(SIZE).fill(0), boxes: new Array(SIZE).fill(0), limit, rng, count: 0, first: null };
  for (let i = 0; i < CELLS; i++) {
    const d = s.values[i];
    if (d === 0) continue;
    s.rows[rowOf(i)] |= bit(d);
    s.cols[colOf(i)] |= bit(d);
    s.boxes[boxOf(i)] |= bit(d);
  }
  search(s);
  return { count: s.count, first: s.first };
}

/** How many solutions the grid has, counting no further than `limit` (2 is enough to tell "unique" from "not unique"). */
export const countSolutions = (values: readonly number[], limit = 2): number => run(values, limit, null).count;

/** A solution of the grid, or null if it has none. */
export const solve = (values: readonly number[]): number[] | null => run(values, 1, null).first;

/** A shuffled, completely filled valid grid. */
export function randomSolution(rng: Rng): number[] {
  const solved = run(new Array<number>(CELLS).fill(0), 1, rng).first;
  if (!solved) throw new Error("Could not build a Sudoku solution");
  return solved;
}
