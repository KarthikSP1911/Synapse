import type { Clocked } from "@/features/games/shared/lib/clock";
import type { Difficulty } from "@/features/games/shared/lib/puzzle-session";

/**
 * Zip types. A board is rows x columns of cells indexed row by row (index = row * cols + column). Some cells carry
 * numbers: the path starts on 1, passes through 2, 3, ... in order and ends on the highest number, covering every
 * cell once. Walls are bold edges between two neighbouring cells that the path may not cross.
 */

export { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/features/games/shared/lib/puzzle-session";

export interface ZipPuzzle {
  rows: number;
  cols: number;
  /** The cell of checkpoint 1, 2, 3 ... in order: `checkpoints[k - 1]` holds the number k. */
  checkpoints: number[];
  /** Walls as "a-b" keys of two neighbouring cells with a < b (see `wallKey`). */
  walls: string[];
}

/** A generated puzzle with its single solution. */
export interface Puzzle {
  difficulty: Difficulty;
  /** The puzzle in text form (see puzzle-format.ts). */
  puzzle: string;
  /** Every cell in the order the one solution visits them. */
  solution: number[];
}

/** What the on-screen hint is about; it goes away as soon as the path changes. */
export interface Hint {
  kind: "wrong" | "next";
  /** The cells to point at: the first wrong cell, or the squares just added. */
  cells: number[];
  text: string;
}

export interface GameState extends Clocked {
  clientId: string;
  difficulty: Difficulty;
  /** The puzzle in text form. */
  puzzle: string;
  /** The one solution, used by hints only. */
  solution: number[];
  /** The path drawn so far, starting on checkpoint 1. */
  path: number[];
  undoStack: number[][];
  redoStack: number[][];
  /** While a stroke is being drawn: the path as it was when the stroke began, to undo the whole stroke at once. Not stored. */
  stroke: number[] | null;
  hintsUsed: number;
  hint: Hint | null;
  startedAt: number;
  endedAt: number | null;
}

export interface ZipSettings {
  /** Show the number of squares still to fill under the board. */
  showRemaining: boolean;
}

export const DEFAULT_SETTINGS: ZipSettings = { showRemaining: true };

/** What is saved for a finished or abandoned game. Points are worked out from it, never stored. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  difficulty: Difficulty;
  /** The puzzle in text form. */
  puzzle: string;
  /** True when the whole board was covered correctly; false when the game was abandoned. */
  completed: boolean;
  /** Playing time only: pauses and time with the game closed are not included. */
  elapsedMs: number;
  hintsUsed: number;
}
