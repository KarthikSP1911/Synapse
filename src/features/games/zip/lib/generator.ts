import type { Rng } from "@/lib/random";
import { shuffle } from "@/features/games/shared/lib/shuffle";
import { rulesOf, validatePath } from "./draw";
import { randomHamiltonianPath } from "./path";
import { formatPuzzle, wallKey } from "./puzzle-format";
import { solvePuzzle } from "./solver";
import type { Difficulty, Puzzle, ZipPuzzle } from "./types";

/**
 * Builds Zip puzzles. The recipe: draw a random path through every cell first, so a solution is known to exist;
 * number cells along it (the first and last cell always carry the first and last number); then, while the solver
 * finds a second solution, remove it by adding a wall on one of its steps that the real path does not use, or a
 * number on a cell where it disagrees with the real path. Both only ever constrain the board, so the real path
 * stays valid. The result is accepted only when the solver proves the solution unique within its node budget.
 */

export interface Profile {
  rows: number;
  cols: number;
  /** About how many numbers (checkpoints) to start with, endpoints included. */
  checkpoints: number;
  /** How many more numbers the repair may add beyond that. */
  extraCheckpoints: number;
  /** The most walls a puzzle may have. */
  maxWalls: number;
  /** How often a repair adds a wall rather than a number (0-1). */
  wallBias: number;
  /** Remove clues that turn out not to be needed (sparser puzzles are harder). */
  minimise: boolean;
}

/** Tuned from the benchmark in scripts/bench-puzzles.ts. */
export const PROFILES: Record<Difficulty, Profile> = {
  easy: { rows: 5, cols: 5, checkpoints: 7, extraCheckpoints: 4, maxWalls: 2, wallBias: 0.15, minimise: false },
  medium: { rows: 6, cols: 6, checkpoints: 7, extraCheckpoints: 4, maxWalls: 5, wallBias: 0.3, minimise: false },
  hard: { rows: 7, cols: 7, checkpoints: 7, extraCheckpoints: 4, maxWalls: 9, wallBias: 0.4, minimise: true },
  expert: { rows: 8, cols: 8, checkpoints: 8, extraCheckpoints: 4, maxWalls: 12, wallBias: 0.5, minimise: true },
};

/**
 * The nodes a search may use while generating, and so the most a freshly built puzzle can cost to verify. The solver's
 * own budget (what the server allows, `NODE_BUDGET`) is five times this, which leaves room for the solver to change
 * without invalidating puzzles already played.
 */
export const GENERATION_NODES = 10_000;

/** Removing a clue is only tried if the search still finishes within this: it keeps the minimising pass quick. */
const MINIMISE_NODES = 6_000;

export class GenerationError extends Error {}

export interface Budget {
  maxAttempts: number;
  maxMs: number;
}

export const DEFAULT_BUDGET: Budget = { maxAttempts: 200, maxMs: 4000 };

export interface Attempts {
  attempts: number;
  /** Repair rounds spent in total (one solver run each). */
  solves: number;
  /** Solver nodes of the accepted puzzle's final uniqueness proof, per accepted puzzle. */
  nodes: number[];
  walls: number[];
  checkpoints: number[];
}

/** Checkpoint indices along the path: the ends, and the rest spread out with some jitter. */
function spreadCheckpoints(total: number, count: number, rng: Rng): number[] {
  const indices = new Set<number>([0, total - 1]);
  const inner = Math.max(0, count - 2);
  for (let i = 1; i <= inner; i++) {
    const centre = (i * (total - 1)) / (inner + 1);
    const jitter = (rng() - 0.5) * ((total - 1) / (inner + 1)) * 0.8;
    const index = Math.min(total - 2, Math.max(1, Math.round(centre + jitter)));
    indices.add(index);
  }
  return [...indices].sort((a, b) => a - b);
}

/** Generates a puzzle of the given difficulty, or throws `GenerationError` when the budget runs out. */
export function generatePuzzle(difficulty: Difficulty, rng: Rng = Math.random, budget: Budget = DEFAULT_BUDGET, stats?: Attempts): Puzzle {
  const profile = PROFILES[difficulty];
  const { rows, cols } = profile;
  const total = rows * cols;
  const started = Date.now();

  for (let attempt = 0; attempt < budget.maxAttempts; attempt++) {
    if (Date.now() - started > budget.maxMs) break;
    if (stats) stats.attempts++;
    const path = randomHamiltonianPath(rows, cols, rng);
    const position = new Int16Array(total);
    path.forEach((cell, i) => (position[cell] = i));

    let indices = spreadCheckpoints(total, profile.checkpoints, rng);
    const walls = new Set<string>();
    const build = (): ZipPuzzle => ({ rows, cols, checkpoints: indices.map((i) => path[i]), walls: [...walls] });
    const maxIndices = profile.checkpoints + profile.extraCheckpoints;

    let unique = false;
    for (let round = 0; round < 60; round++) {
      const puzzle = build();
      const result = solvePuzzle(puzzle, { budget: GENERATION_NODES });
      if (stats) stats.solves++;
      if (!result.exceeded && result.count === 1) {
        unique = true;
        break;
      }
      if (indices.length >= maxIndices && walls.size >= profile.maxWalls) break;
      // Another solution to remove (when the search ran out of budget, any more clue helps: add a number).
      const other = result.exceeded ? null : [result.first, result.second].find((s) => s !== null && s.some((cell, i) => cell !== path[i])) ?? null;
      const canWall = walls.size < profile.maxWalls;
      const canNumber = indices.length < maxIndices;
      if (other && canWall && (!canNumber || rng() < profile.wallBias)) {
        const candidates: string[] = [];
        for (let i = 0; i + 1 < other.length; i++) {
          if (Math.abs(position[other[i]] - position[other[i + 1]]) !== 1) candidates.push(wallKey(other[i], other[i + 1]));
        }
        const fresh = candidates.filter((k) => !walls.has(k));
        if (fresh.length > 0) {
          walls.add(fresh[Math.floor(rng() * fresh.length)]);
          continue;
        }
      }
      if (!canNumber) break;
      // Add a number on a path cell where the other solution goes elsewhere (or any free cell if the search was cut off).
      const taken = new Set(indices);
      const free = shuffle(
        Array.from({ length: total }, (_, i) => i).filter((i) => !taken.has(i)),
        rng
      );
      let chosen = free[0];
      if (other) {
        for (const j of free) {
          const trial = [...indices, j].sort((a, b) => a - b);
          const trialRules = rulesOf({ rows, cols, checkpoints: trial.map((i) => path[i]), walls: [...walls] });
          if (!validatePath(trialRules, other)) {
            chosen = j;
            break;
          }
        }
      }
      indices = [...indices, chosen].sort((a, b) => a - b);
    }
    if (!unique) continue;

    if (profile.minimise) {
      // Drop clues one at a time while the solution stays unique: what is left is what the puzzle really needs.
      for (const key of shuffle([...walls], rng)) {
        walls.delete(key);
        const r = solvePuzzle(build(), { budget: MINIMISE_NODES });
        if (r.exceeded || r.count !== 1) walls.add(key);
      }
      for (const index of shuffle(indices.slice(1, -1), rng)) {
        const without = indices.filter((i) => i !== index);
        const r = solvePuzzle({ rows, cols, checkpoints: without.map((i) => path[i]), walls: [...walls] }, { budget: MINIMISE_NODES });
        if (!r.exceeded && r.count === 1) indices = without;
      }
    }
    const puzzle = build();
    const final = solvePuzzle(puzzle, { budget: GENERATION_NODES });
    if (final.exceeded || final.count !== 1 || !final.first) continue;
    if (stats) {
      stats.nodes.push(final.nodes);
      stats.walls.push(puzzle.walls.length);
      stats.checkpoints.push(puzzle.checkpoints.length);
    }
    return { difficulty, puzzle: formatPuzzle(puzzle), solution: final.first };
  }
  throw new GenerationError(`No ${difficulty} Zip puzzle within the budget.`);
}
