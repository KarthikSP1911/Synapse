import type { Clocked } from "@/features/games/shared/lib/clock";
import type { Difficulty } from "@/features/games/shared/lib/puzzle-session";

/**
 * Queens types. A board is N x N with N colour regions, stored as an N*N-character string of region digits
 * (row by row), so a puzzle is a short, copyable value. The solution is never stored in a record: it is found
 * again by the solver.
 */

export { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/features/games/shared/lib/puzzle-session";

/** What a cell holds: nothing, a cross-out, a queen, or a queen revealed by a hint (locked, and counted as assisted). */
export const EMPTY = 0;
export const CROSS = 1;
export const QUEEN = 2;
export const HINTED = 3;
export type Mark = 0 | 1 | 2 | 3;

export const isQueen = (m: number): boolean => m === QUEEN || m === HINTED;

/** A generated puzzle with its single solution. */
export interface Puzzle {
  difficulty: Difficulty;
  /** N*N digits, the region (0..N-1) of each cell. */
  regions: string;
  /** N digits: the column of the queen in each row. */
  solution: string;
}

export interface CellChange {
  index: number;
  before: Mark;
  after: Mark;
}

/** One undoable step. A drag that crosses out several cells is still one step. */
export interface Move {
  changes: CellChange[];
}

/** A rule that two or more queens break together. */
export interface Conflict {
  kind: "row" | "column" | "region" | "touch";
  cells: number[];
}

/**
 * Hints come in steps, each press showing more: first the reason (the units behind it), then the cells it is about,
 * then the queen itself. "wrong" is the one exception: it points at a queen of the player that is not in the solution.
 */
export type HintKind = "wrong" | "reason" | "cells" | "place";

/** The current hint on screen; it goes away as soon as the board changes. */
export interface Hint {
  kind: HintKind;
  /** The units behind the hint: rows "r0".., columns "c0".., regions "g0".. (see deduce.ts). */
  units: string[];
  /** The cells to point at now: the wrong queen, the cells to cross out, or the cell that must hold a queen. */
  cells: number[];
  /** The cells the next step of the hint would cross out. */
  eliminate: number[];
  /** The cell that must hold a queen: what the last step of the hint places. */
  queen: number | null;
  /** A sentence that explains the hint. */
  text: string;
}

export interface GameState extends Clocked {
  clientId: string;
  difficulty: Difficulty;
  size: number;
  regions: string;
  solution: string;
  cells: Mark[];
  undoStack: Move[];
  redoStack: Move[];
  hintsUsed: number;
  hint: Hint | null;
  /** The cell last changed and when, to ignore a second tap that would remove a queen just placed. Not stored. */
  lastEdit: { index: number; at: number } | null;
  startedAt: number;
  endedAt: number | null;
}

export interface QueensSettings {
  /** Mark rule-breaking queens as they are placed, or only when the player presses Check. */
  autoCheck: boolean;
}

export const DEFAULT_SETTINGS: QueensSettings = { autoCheck: true };

/** What is saved for a finished or abandoned game. Points are worked out from it, never stored. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  difficulty: Difficulty;
  /** The N*N region digits. */
  puzzle: string;
  /** True when the board was solved; false when the game was abandoned. */
  completed: boolean;
  /** Playing time only: pauses and time with the game closed are not included. */
  elapsedMs: number;
  hintsUsed: number;
}
