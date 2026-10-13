/**
 * 2048 types. The board is a flat array of 16 numbers, row by row, 0 for an empty cell; everything the rules need is
 * in that array, so a position can be saved, undone and compared as plain data.
 */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const WIN_TILE = 2048;
/** The largest tile a 4x4 board can hold (2^17). */
export const MAX_TILE = 131072;
/** Chance that a new tile is a 2 rather than a 4. */
export const SPAWN_TWO_CHANCE = 0.9;

export const DIRECTIONS = ["up", "down", "left", "right"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type Grid = number[];

/** One tile's journey in a move, for animation. A merge is two entries (`merged: true`) with the same `to`. */
export interface TileMove {
  from: number;
  to: number;
  /** The tile's value before the move. */
  value: number;
  merged: boolean;
}

export interface MoveResult {
  grid: Grid;
  /** Points scored: the sum of the tiles created by merging. */
  gained: number;
  /** False when nothing slid or merged, in which case nothing else may happen (no new tile, no score). */
  moved: boolean;
  moves: TileMove[];
}

/** Playing: waiting for a move. Won: a 2048 tile was just made and the player has to choose. Over: no move is left. */
export type GameStatus = "playing" | "won" | "over";

/** What undo goes back to. */
export interface Snapshot {
  grid: Grid;
  score: number;
  best: number;
  moves: number;
  highestTile: number;
  reached2048: boolean;
  continued: boolean;
  status: GameStatus;
}

export interface GameState {
  clientId: string;
  grid: Grid;
  score: number;
  /** Best score on this device (or account), kept in step with `score` and restored by undo along with it. */
  best: number;
  /** Moves that changed the board. */
  moves: number;
  /** Largest tile made in this game so far (undo puts it back with the rest of the position). */
  highestTile: number;
  /** A 2048 tile has been made in this game. */
  reached2048: boolean;
  /** The player chose to keep playing after reaching 2048. */
  continued: boolean;
  status: GameStatus;
  /** One step of undo: the position before the last move, or null if there is none (or it was used). */
  previous: Snapshot | null;
  undosUsed: number;
  startedAt: number;
  endedAt: number | null;
  /** Playing time banked before `resumedAt`: time with the page hidden or closed is not counted. */
  elapsedMs: number;
  /** When the clock last started; null while stopped. */
  resumedAt: number | null;
}

/** What is saved for a game that ended (no move left) or was given up. Points are as played, never recomputed. */
export interface SessionData {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
  score: number;
  highestTile: number;
  moves: number;
  durationMs: number;
  reached2048: boolean;
  /** True when the game ended because no move was left; false when it was given up. */
  gameOver: boolean;
  undosUsed: number;
}
