import { formatGrid } from "./grid";
import { ratePuzzle } from "./rating";
import type { Rng } from "@/lib/random";
import { countSolutions, randomSolution, shuffle } from "./solver";
import { CELLS, type Difficulty, type Puzzle } from "./types";

/**
 * Builds puzzles. Every puzzle starts from a full valid grid and has clues taken away one at a time; a clue is
 * only taken away if the puzzle still has exactly one solution AND is still no harder than the difficulty being
 * built (see `./rating.ts`). The puzzle is accepted only if the techniques it needs match that difficulty, so the
 * label always reflects how it is solved, not how many cells are empty.
 */

export class GenerationError extends Error {
  constructor(difficulty: Difficulty) {
    super(`Could not generate a ${difficulty} puzzle`);
    this.name = "GenerationError";
  }
}

interface Profile {
  /** Hardest technique level allowed while removing clues; null = no limit (expert). */
  cap: 1 | 2 | 3 | null;
  /** Stop removing once the puzzle is at this many clues or fewer, provided it already has the right difficulty. */
  stopAt: [min: number, max: number];
  /** A finished puzzle with more clues than this is thrown away. */
  maxClues: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { cap: 1, stopAt: [36, 40], maxClues: 46 },
  medium: { cap: 2, stopAt: [30, 34], maxClues: 38 },
  hard: { cap: 3, stopAt: [26, 30], maxClues: 34 },
  expert: { cap: null, stopAt: [0, 0], maxClues: 30 },
};

const MAX_ATTEMPTS = 400;

const randInt = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

/** One try; null if the clues ran out before the puzzle reached the wanted difficulty. */
function attempt(difficulty: Difficulty, rng: Rng): Puzzle | null {
  const profile = PROFILES[difficulty];
  const solution = randomSolution(rng);
  const values = [...solution];
  const stopAt = randInt(rng, profile.stopAt[0], profile.stopAt[1]);
  let clues = CELLS;

  for (const cell of shuffle(Array.from({ length: CELLS }, (_, i) => i), rng)) {
    const digit = values[cell];
    values[cell] = 0;

    let keep = false;
    if (countSolutions(values, 2) === 1) {
      if (profile.cap === null) keep = true;
      else {
        const rating = ratePuzzle(values, profile.cap);
        keep = rating.solved;
      }
    }
    if (!keep) {
      values[cell] = digit;
      continue;
    }
    clues--;
    if (clues <= stopAt && profile.cap !== null && ratePuzzle(values, profile.cap).difficulty === difficulty) break;
  }

  if (clues > profile.maxClues) return null;
  if (countSolutions(values, 2) !== 1) return null;
  const rating = ratePuzzle(values);
  if (rating.difficulty !== difficulty) return null;
  return { difficulty, puzzle: formatGrid(values), solution: formatGrid(solution) };
}

/** A puzzle of the requested difficulty with exactly one solution. `rng` can be seeded for repeatable results. */
export function generatePuzzle(difficulty: Difficulty, rng: Rng = Math.random): Puzzle {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const puzzle = attempt(difficulty, rng);
    if (puzzle) return puzzle;
  }
  throw new GenerationError(difficulty);
}
