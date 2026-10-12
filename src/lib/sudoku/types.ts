/**
 * Sudoku types. Grids travel as flat arrays of 81 numbers (0 = empty, row by row) while computing and as
 * 81-character strings ("0" = empty) when stored, so a puzzle is a short, copyable value.
 */

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };

export const SIZE = 9;
export const CELLS = SIZE * SIZE;

/** A generated puzzle with its single solution. */
export interface Puzzle {
  difficulty: Difficulty;
  /** 81 characters, "0" for an empty cell. */
  puzzle: string;
  /** 81 characters, all digits 1-9. */
  solution: string;
}

/** What the player has in one cell. Notes are a bit mask: bit (d - 1) set means digit d is pencilled in. */
export interface CellState {
  value: number;
  notes: number;
  /** The digit was revealed by a hint, so it counts as assisted and cannot be edited. */
  hinted: boolean;
}

export interface CellChange {
  index: number;
  before: CellState;
  after: CellState;
}

/** One undoable step. A single entry can also clear that digit from the notes of its peers, hence several changes. */
export interface Move {
  changes: CellChange[];
}

export type GameStatus = "playing" | "paused" | "completed" | "revealed";

export interface GameState {
  clientId: string;
  difficulty: Difficulty;
  puzzle: string;
  solution: string;
  cells: CellState[];
  undoStack: Move[];
  redoStack: Move[];
  mistakes: number;
  hintsUsed: number;
  status: GameStatus;
  startedAt: number;
  endedAt: number | null;
  /** Playing time banked before `resumedAt`. Time while paused, or while the game was closed, is never added. */
  elapsedMs: number;
  /** When the clock last started running; null while paused or finished. */
  resumedAt: number | null;
}

export type HighlightMode = "instant" | "check";

export interface SudokuSettings {
  /** Mark conflicting and wrong entries as they are made, or only when the player presses Check. */
  highlight: HighlightMode;
  /** Count wrong entries as mistakes. */
  trackMistakes: boolean;
}

export const DEFAULT_SETTINGS: SudokuSettings = { highlight: "instant", trackMistakes: true };

/** What is saved for a finished or abandoned game. Points are worked out from it, never stored. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  difficulty: Difficulty;
  puzzle: string;
  /** True when the board was filled in correctly; false when the game was abandoned or the solution was revealed. */
  completed: boolean;
  /** Playing time only: pauses and time with the game closed are not included. */
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
}
