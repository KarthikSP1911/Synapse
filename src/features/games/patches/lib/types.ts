import type { Clocked } from "@/features/games/shared/lib/clock";
import type { Difficulty } from "@/features/games/shared/lib/puzzle-session";

/**
 * Patches types. A board is rows x columns of cells indexed row by row (index = row * cols + column). Some cells are
 * clues. The player divides the board into patches: connected groups of cells, every cell in exactly one patch and
 * every patch holding exactly one clue, whose area and shape the patch must satisfy.
 *
 * What a clue says (the model keeps both fields explicit, so drawing, validation and the solver never disagree):
 *
 *   area   the exact number of cells, or null when the clue does not say
 *   shape  "square" | "wide" | "tall"  a rectangle that is as wide as tall / wider than tall / taller than wide
 *          "free"                      any connected shape (a freeform clue always shows its area)
 *          null                        not said: the patch is a rectangle of any size and proportion
 */

export { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/features/games/shared/lib/puzzle-session";

export const SHAPES = ["square", "wide", "tall", "free"] as const;
export type Shape = (typeof SHAPES)[number];

export interface Clue {
  /** The cell the clue sits on. */
  cell: number;
  area: number | null;
  shape: Shape | null;
}

export interface PatchesPuzzle {
  rows: number;
  cols: number;
  /** Sorted by cell, so a clue's position in this list is its identity. */
  clues: Clue[];
}

/** A generated puzzle with its single solution. */
export interface Puzzle {
  difficulty: Difficulty;
  /** The puzzle in text form (see puzzle-format.ts). */
  puzzle: string;
  /** For every cell, the index (in `clues`) of the clue whose patch it belongs to. */
  solution: number[];
}

/** A patch the player has drawn: the clue it belongs to and its cells (sorted). */
export interface Patch {
  clue: number;
  cells: number[];
}

/**
 * What the on-screen hint is about; it goes away as soon as the board changes.
 *   wrong   a patch that cannot be part of the solution
 *   focus   a clue (and perhaps a cell) to look at, with the reason it is easy to place
 *   reveal  the exact cells of one patch, asked for by pressing Hint again on the same clue
 */
export interface Hint {
  kind: "wrong" | "focus" | "reveal";
  clue: number;
  /** The cells to point at. */
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
  /** The patches drawn so far; never overlapping, each valid for its clue. */
  patches: Patch[];
  undoStack: Patch[][];
  redoStack: Patch[][];
  hintsUsed: number;
  hint: Hint | null;
  startedAt: number;
  endedAt: number | null;
}

export interface PatchesSettings {
  /** Mark clues and cells that no remaining patch can serve, as soon as the board changes. */
  autoCheck: boolean;
  /** Show the number of cells still to cover. */
  showRemaining: boolean;
  /** Use the larger board of the difficulty. */
  larger: boolean;
}

export const DEFAULT_SETTINGS: PatchesSettings = { autoCheck: true, showRemaining: true, larger: false };

/** What is saved for a finished or abandoned game. Points are worked out from it, never stored. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  difficulty: Difficulty;
  /** The puzzle in text form. */
  puzzle: string;
  /** True when the whole board was divided correctly; false when the game was abandoned. */
  completed: boolean;
  /** Playing time only: pauses and time with the game closed are not included. */
  elapsedMs: number;
  hintsUsed: number;
}
