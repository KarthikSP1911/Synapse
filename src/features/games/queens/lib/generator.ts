import type { Rng } from "@/lib/random";
import { shuffle } from "@/features/games/shared/lib/shuffle";
import { rate } from "./deduce";
import { formatRegions, type Board } from "./grid";
import { solveOtherThan } from "./solver";
import type { Difficulty, Puzzle } from "./types";

/**
 * Builds Queens puzzles. The recipe: place n queens that follow the rules, grow n connected colour regions out of
 * them, keep the layout only if exactly one solution exists, and keep it only if a person-like solver needs the
 * technique depth the difficulty asks for (see deduce.ts). Nothing is mislabelled: if no layout fits within the
 * budget, generation fails and the caller says so.
 */

export interface Profile {
  /** Side length of the board (and the number of regions). */
  size: number;
  /** The deepest technique tier the puzzle must need, inclusive (see deduce.ts). */
  minLevel: number;
  maxLevel: number;
}

/** Tuned from the benchmark in scripts/bench-puzzles.ts. */
export const PROFILES: Record<Difficulty, Profile> = {
  easy: { size: 6, minLevel: 1, maxLevel: 2 },
  medium: { size: 7, minLevel: 3, maxLevel: 3 },
  hard: { size: 8, minLevel: 4, maxLevel: 4 },
  expert: { size: 9, minLevel: 5, maxLevel: 8 },
};

export class GenerationError extends Error {}

export interface Budget {
  maxAttempts: number;
  maxMs: number;
}

export const DEFAULT_BUDGET: Budget = { maxAttempts: 20_000, maxMs: 4000 };

/** One queen per row and column with no two touching, chosen at random; null if the random walk dead-ends. */
function randomQueens(n: number, rng: Rng): number[] | null {
  const columns = new Array<number>(n).fill(-1);
  const place = (row: number, used: number): boolean => {
    if (row === n) return true;
    const prev = row > 0 ? columns[row - 1] : -10;
    const options = shuffle(
      Array.from({ length: n }, (_, c) => c).filter((c) => !(used & (1 << c)) && Math.abs(c - prev) >= 2),
      rng
    );
    for (const c of options) {
      columns[row] = c;
      if (place(row + 1, used | (1 << c))) return true;
    }
    return false;
  };
  return place(0, 0) ? columns : null;
}

/** Grows one connected region out of each queen's cell until every cell belongs to one. `alpha` favours small regions. */
function growRegions(columns: readonly number[], n: number, rng: Rng, alpha: number): number[] {
  const reg = new Array<number>(n * n).fill(-1);
  const size = new Array<number>(n).fill(1);
  columns.forEach((c, r) => {
    reg[r * n + c] = r;
  });
  for (let left = n * n - n; left > 0; left--) {
    const options: { cell: number; region: number; weight: number }[] = [];
    let total = 0;
    for (let cell = 0; cell < n * n; cell++) {
      if (reg[cell] !== -1) continue;
      const r = Math.floor(cell / n);
      const c = cell % n;
      const seen = new Set<number>();
      for (const next of [r > 0 ? cell - n : -1, r < n - 1 ? cell + n : -1, c > 0 ? cell - 1 : -1, c < n - 1 ? cell + 1 : -1]) {
        const g = next >= 0 ? reg[next] : -1;
        if (g === -1 || seen.has(g)) continue;
        seen.add(g);
        const weight = Math.pow(size[g], -alpha);
        options.push({ cell, region: g, weight });
        total += weight;
      }
    }
    let pick = rng() * total;
    let chosen = options[options.length - 1];
    for (const o of options) {
      pick -= o.weight;
      if (pick <= 0) {
        chosen = o;
        break;
      }
    }
    reg[chosen.cell] = chosen.region;
    size[chosen.region]++;
  }
  return reg;
}

/** True when region `g` stays one connected piece if cell `gone` leaves it. */
function staysConnected(reg: readonly number[], n: number, g: number, gone: number): boolean {
  const cells = reg.flatMap((v, i) => (v === g && i !== gone ? [i] : []));
  if (cells.length === 0) return false;
  const left = new Set(cells);
  const stack = [cells[0]];
  left.delete(cells[0]);
  while (stack.length > 0) {
    const at = stack.pop() as number;
    const r = Math.floor(at / n);
    const c = at % n;
    for (const next of [r > 0 ? at - n : -1, r < n - 1 ? at + n : -1, c > 0 ? at - 1 : -1, c < n - 1 ? at + 1 : -1]) {
      if (next >= 0 && left.delete(next)) stack.push(next);
    }
  }
  return left.size === 0;
}

/**
 * Makes the intended solution the only one. While another solution exists, one of its queens (in a cell that is
 * not an intended queen) is moved into a neighbouring region: that region then holds two queens of the other
 * solution, which so no longer works, and the intended solution is untouched. Edits `reg` in place; false if it
 * got stuck or ran out of steps.
 */
function makeUnique(reg: number[], columns: readonly number[], n: number, rng: Rng, maxSteps: number): boolean {
  for (let step = 0; step < maxSteps; step++) {
    const other = solveOtherThan({ n, reg }, columns);
    if (!other) return true;
    const rows = shuffle(Array.from({ length: n }, (_, r) => r).filter((r) => other[r] !== columns[r]), rng);
    let moved = false;
    for (const r of rows) {
      const x = r * n + other[r];
      const g = reg[x];
      const c = x % n;
      const targets = shuffle(
        [r > 0 ? x - n : -1, r < n - 1 ? x + n : -1, c > 0 ? x - 1 : -1, c < n - 1 ? x + 1 : -1].filter((y) => y >= 0 && reg[y] !== g),
        rng
      );
      for (const y of targets) {
        if (!staysConnected(reg, n, g, x)) break;
        reg[x] = reg[y];
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) return false;
  }
  return false;
}

/** Region numbers follow the queens' rows when grown; shuffling them keeps the colours from hinting at the solution. */
function relabel(reg: readonly number[], n: number, rng: Rng): number[] {
  const labels = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  return reg.map((g) => labels[g]);
}

export interface Attempts {
  attempts: number;
  unique: number;
}

/** Generates a puzzle of the given difficulty, or throws `GenerationError` when the budget runs out. */
export function generatePuzzle(difficulty: Difficulty, rng: Rng = Math.random, budget: Budget = DEFAULT_BUDGET, stats?: Attempts): Puzzle {
  const { size: n, minLevel, maxLevel } = PROFILES[difficulty];
  const started = Date.now();
  for (let attempt = 0; attempt < budget.maxAttempts; attempt++) {
    if (attempt % 64 === 63 && Date.now() - started > budget.maxMs) break;
    if (stats) stats.attempts++;
    const columns = randomQueens(n, rng);
    if (!columns) continue;
    const reg = growRegions(columns, n, rng, rng() * 1.6);
    if (!makeUnique(reg, columns, n, rng, 6 * n)) continue;
    const board: Board = { n, reg };
    if (stats) stats.unique++;
    const { level } = rate(board, maxLevel);
    // Rated within the cap, so the puzzle needs at most maxLevel; the floor keeps easy ones from being hard.
    if (level === null || level < minLevel) continue;
    return { difficulty, regions: formatRegions(relabel(reg, n, rng)), solution: columns.join("") };
  }
  throw new GenerationError(`No ${difficulty} Queens puzzle within the budget.`);
}
