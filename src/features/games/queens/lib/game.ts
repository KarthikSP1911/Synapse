import { freezeClock, pauseClock, resumeClock, stopClock, elapsedAt } from "@/features/games/shared/lib/clock";
import { findConflicts, parseRegions, type Board } from "./grid";
import { advanceHint, startHint, wrongQueen, wrongQueenHint } from "./hints";
import { CROSS, EMPTY, HINTED, QUEEN, isQueen, type CellChange, type GameState, type Mark, type Move, type Puzzle, type SessionData } from "./types";

/**
 * Rules of a Queens game in progress. Every function takes a state and returns a new one (or the same object when
 * nothing changed), and the clock is passed in as `now`, so all of it can be tested without a browser.
 */

/** Undo history is kept for this many moves; older ones are forgotten. */
export const MAX_HISTORY = 200;
/** A queen cannot be tapped away again this soon after it was placed: a double tap would otherwise undo the placement. */
export const DOUBLE_TAP_MS = 400;

export { elapsedAt };
export const pauseGame = pauseClock<GameState>;
export const resumeGame = resumeClock<GameState>;
export const freezeForStorage = freezeClock<GameState>;

/** The board of a game (its size and regions). */
export function boardOf(state: Pick<GameState, "size" | "regions">): Board {
  return { n: state.size, reg: Array.from(state.regions, Number) };
}

export function newGame(puzzle: Puzzle, clientId: string, now: number): GameState {
  const board = parseRegions(puzzle.regions);
  if (!board) throw new Error("Invalid puzzle");
  return {
    clientId,
    difficulty: puzzle.difficulty,
    size: board.n,
    regions: puzzle.regions,
    solution: puzzle.solution,
    cells: new Array<Mark>(board.n * board.n).fill(EMPTY),
    undoStack: [],
    redoStack: [],
    hintsUsed: 0,
    hint: null,
    lastEdit: null,
    status: "playing",
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    resumedAt: now,
  };
}

/** The same puzzle from the start: marks, hints and the clock cleared. The game keeps its id, so it can only ever be recorded once. */
export const restartGame = (state: GameState, now: number): GameState =>
  newGame({ difficulty: state.difficulty, regions: state.regions, solution: state.solution }, state.clientId, now);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const queensOn = (cells: readonly Mark[]): number[] => cells.flatMap((m, i) => (isQueen(m) ? [i] : []));

/** Solved: one queen per row, column and region, none touching. With a unique solution that is the solution. */
export function isComplete(state: Pick<GameState, "cells" | "size" | "regions">): boolean {
  return queensOn(state.cells).length === state.size && findConflicts(state.cells, boardOf(state)).length === 0;
}

export interface CheckResult {
  conflicts: ReturnType<typeof findConflicts>;
  queens: number;
  /** No rule is broken so far; queens may still be missing. */
  ok: boolean;
}

/** Rule check for the Check button and Auto-check: it reports broken rules, never whether a queen is "right". */
export function checkBoard(state: Pick<GameState, "cells" | "size" | "regions">): CheckResult {
  const conflicts = findConflicts(state.cells, boardOf(state));
  return { conflicts, queens: queensOn(state.cells).length, ok: conflicts.length === 0 };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/** Applies a move: cells change, redo is forgotten, any hint is dismissed, and the game may now be complete. */
function commit(state: GameState, changes: CellChange[], now: number, extra: Partial<GameState> = {}): GameState {
  const real = changes.filter((c) => c.before !== c.after);
  if (real.length === 0) return state;
  const cells = state.cells.slice();
  for (const c of real) cells[c.index] = c.after;
  const move: Move = { changes: real };
  const next: GameState = {
    ...state,
    ...extra,
    cells,
    undoStack: [...state.undoStack, move].slice(-MAX_HISTORY),
    redoStack: [],
    hint: null,
    lastEdit: { index: real[real.length - 1].index, at: now },
  };
  return isComplete(next) ? stopClock(next, now) : next;
}

const playing = (state: GameState): boolean => state.status === "playing";

/**
 * A tap: empty becomes a cross-out, a cross-out becomes a queen, a queen becomes empty again. A queen that was
 * placed a moment ago is not removed by a quick extra tap, and revealed (hinted) queens are locked.
 */
export function tapCell(state: GameState, index: number, now: number): GameState {
  if (!playing(state) || index < 0 || index >= state.cells.length) return state;
  const before = state.cells[index];
  if (before === HINTED) return state;
  if (before === QUEEN && state.lastEdit && state.lastEdit.index === index && now - state.lastEdit.at < DOUBLE_TAP_MS) return state;
  const after: Mark = before === EMPTY ? CROSS : before === CROSS ? QUEEN : EMPTY;
  return commit(state, [{ index, before, after }], now);
}

/** Sets one cell directly (keyboard shortcuts). Revealed queens cannot be changed. */
export function setCell(state: GameState, index: number, mark: typeof EMPTY | typeof CROSS | typeof QUEEN, now: number): GameState {
  if (!playing(state) || index < 0 || index >= state.cells.length) return state;
  const before = state.cells[index];
  if (before === HINTED) return state;
  return commit(state, [{ index, before, after: mark }], now);
}

/**
 * Drag marking: cells that are empty become cross-outs (`to` is CROSS) or cross-outs are cleared (`to` is EMPTY).
 * Queens are never touched, so a drag cannot remove one by accident. The whole drag is one undo step.
 */
export function markCells(state: GameState, indices: readonly number[], to: typeof CROSS | typeof EMPTY, now: number): GameState {
  if (!playing(state)) return state;
  const from = to === CROSS ? EMPTY : CROSS;
  const changes: CellChange[] = [];
  for (const index of new Set(indices)) {
    if (state.cells[index] === from) changes.push({ index, before: from, after: to });
  }
  return commit(state, changes, now);
}

/** Empties the board of the player's marks and queens (revealed queens stay). One undoable step. */
export function clearBoard(state: GameState, now: number): GameState {
  if (!playing(state)) return state;
  const changes: CellChange[] = [];
  state.cells.forEach((before, index) => {
    if (before === CROSS || before === QUEEN) changes.push({ index, before, after: EMPTY });
  });
  return commit(state, changes, now);
}

export function undo(state: GameState): GameState {
  if (!playing(state)) return state;
  const move = state.undoStack[state.undoStack.length - 1];
  if (!move) return state;
  const cells = state.cells.slice();
  for (const c of move.changes) cells[c.index] = c.before;
  return { ...state, cells, hint: null, lastEdit: null, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, move] };
}

export function redo(state: GameState): GameState {
  if (!playing(state)) return state;
  const move = state.redoStack[state.redoStack.length - 1];
  if (!move) return state;
  const cells = state.cells.slice();
  for (const c of move.changes) cells[c.index] = c.after;
  return { ...state, cells, hint: null, lastEdit: null, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, move] };
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

/**
 * One press of the Hint button, and each press counts as a hint. A wrong queen is pointed out first. Otherwise a
 * hint grows over successive presses (while the board stays as it is): the reason, then the cells it concerns,
 * then the queen itself, placed and locked.
 */
export function giveHint(state: GameState, now: number): GameState {
  if (!playing(state)) return state;
  const board = boardOf(state);
  const wrong = wrongQueen(state.cells, state.solution, state.size);
  if (wrong !== null) {
    // Asking again about the same queen shows the same thing and costs nothing.
    if (state.hint?.kind === "wrong" && state.hint.cells[0] === wrong) return state;
    return { ...state, hint: wrongQueenHint(wrong, state.size), hintsUsed: state.hintsUsed + 1 };
  }
  const current = state.hint && state.hint.kind !== "wrong" ? state.hint : null;
  const next = current ? advanceHint(current) : startHint(board, state.cells, state.solution);
  if (next === null) return state;
  if (next.kind === "place" && next.queen !== null) {
    const index = next.queen;
    return commit(state, [{ index, before: state.cells[index], after: HINTED }], now, { hintsUsed: state.hintsUsed + 1 });
  }
  return { ...state, hint: next, hintsUsed: state.hintsUsed + 1 };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Whether a game has been touched enough to count as an attempt if it is abandoned. */
export const hasProgress = (state: GameState): boolean => state.undoStack.length > 0 || state.hintsUsed > 0;

/** What is saved when a game ends (solved) or is given up. `completed` is true only for a real solve. */
export function toSessionData(state: GameState, now: number): SessionData {
  return {
    clientId: state.clientId,
    startedAt: state.startedAt,
    endedAt: state.endedAt ?? now,
    difficulty: state.difficulty,
    puzzle: state.regions,
    completed: state.status === "completed",
    elapsedMs: elapsedAt(state, state.endedAt ?? now),
    hintsUsed: state.hintsUsed,
  };
}
