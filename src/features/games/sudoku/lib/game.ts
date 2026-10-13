import { PEERS, bit, candidatesOf, findConflicts, isSolved, parseGrid } from "./grid";
import { CELLS, type CellChange, type CellState, type GameState, type Move, type Puzzle, type SessionData } from "./types";

/**
 * Rules of a game in progress. Every function takes a state and returns a new one (or the same object when
 * nothing changed), and the clock is passed in as `now`, so all of it can be tested without a browser.
 */

/** Undo history is kept for this many moves; older ones are forgotten. */
export const MAX_HISTORY = 400;

const EMPTY_CELL: CellState = { value: 0, notes: 0, hinted: false };

export const isGiven = (state: Pick<GameState, "puzzle">, index: number): boolean => state.puzzle[index] !== "0";

const valuesOf = (cells: readonly CellState[]): number[] => cells.map((c) => c.value);

export function newGame(puzzle: Puzzle, clientId: string, now: number): GameState {
  const grid = parseGrid(puzzle.puzzle);
  if (!grid) throw new Error("Invalid puzzle");
  return {
    clientId,
    difficulty: puzzle.difficulty,
    puzzle: puzzle.puzzle,
    solution: puzzle.solution,
    cells: grid.map((value) => ({ value, notes: 0, hinted: false })),
    undoStack: [],
    redoStack: [],
    mistakes: 0,
    hintsUsed: 0,
    status: "playing",
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    resumedAt: now,
  };
}

/** The same puzzle from the start: entries, notes, hints and mistakes cleared and the clock back to zero. */
export const restartGame = (state: GameState, now: number): GameState =>
  newGame({ difficulty: state.difficulty, puzzle: state.puzzle, solution: state.solution }, state.clientId, now);

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Playing time so far. Paused time and time spent with the game closed are never included. */
export const elapsedAt = (state: Pick<GameState, "elapsedMs" | "resumedAt">, now: number): number =>
  state.elapsedMs + (state.resumedAt === null ? 0 : Math.max(0, now - state.resumedAt));

export function pauseGame(state: GameState, now: number): GameState {
  if (state.status !== "playing") return state;
  return { ...state, status: "paused", elapsedMs: elapsedAt(state, now), resumedAt: null };
}

export function resumeGame(state: GameState, now: number): GameState {
  if (state.status !== "paused") return state;
  return { ...state, status: "playing", resumedAt: now };
}

/** The state as it should be written to storage: a running clock is banked and the game comes back paused. */
export function freezeForStorage(state: GameState, now: number): GameState {
  return state.status === "playing" ? pauseGame(state, now) : state;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

interface EntryOptions {
  /** Enter pencil marks instead of a digit. */
  notes: boolean;
  /** Count a wrong digit as a mistake. */
  trackMistakes: boolean;
}

const sameCell = (a: CellState, b: CellState): boolean => a.value === b.value && a.notes === b.notes && a.hinted === b.hinted;

/** Applies a move to the state: cells change, redo is forgotten, and the game may now be complete. */
function commit(state: GameState, changes: CellChange[], now: number, extra: Partial<GameState> = {}): GameState {
  const real = changes.filter((c) => !sameCell(c.before, c.after));
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
  };
  return finishIfSolved(next, now);
}

/** The board is complete only when every cell is filled, the rules hold, and it is the intended solution. */
export function isComplete(state: Pick<GameState, "cells" | "solution">): boolean {
  const values = valuesOf(state.cells);
  return isSolved(values) && values.join("") === state.solution;
}

function finishIfSolved(state: GameState, now: number): GameState {
  if (!isComplete(state)) return state;
  return { ...state, status: "completed", elapsedMs: elapsedAt(state, now), resumedAt: null, endedAt: now };
}

/** Changes that remove digit d from the notes of every peer of a cell. */
function clearPeerNotes(state: GameState, index: number, digit: number, pending: Map<number, CellState>): void {
  for (const p of PEERS[index]) {
    const cell = pending.get(p) ?? state.cells[p];
    if (cell.value === 0 && cell.notes & bit(digit)) pending.set(p, { ...cell, notes: cell.notes & ~bit(digit) });
  }
}

function changesFrom(state: GameState, pending: Map<number, CellState>): CellChange[] {
  return [...pending.entries()].map(([index, after]) => ({ index, before: state.cells[index], after }));
}

/** Whether the player may change a cell: it must not be a clue or a revealed hint, and the game must be running. */
const isEditable = (state: GameState, index: number): boolean => state.status === "playing" && !isGiven(state, index) && !state.cells[index].hinted;

/**
 * Puts a digit in a cell, or switches a pencil mark on or off. Clues and revealed hints cannot be changed. In
 * digit mode, a cell's own notes are cleared and the digit is struck from its peers' notes; a digit that differs
 * from the solution counts as a mistake. Typing the digit that is already there does nothing.
 */
export function enterDigit(state: GameState, index: number, digit: number, now: number, options: EntryOptions): GameState {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return state;
  if (!isEditable(state, index)) return state;
  const cell = state.cells[index];
  const pending = new Map<number, CellState>();

  if (options.notes) {
    if (cell.value !== 0) return state;
    pending.set(index, { ...cell, notes: cell.notes ^ bit(digit) });
    return commit(state, changesFrom(state, pending), now);
  }

  if (cell.value === digit) return state;
  pending.set(index, { value: digit, notes: 0, hinted: false });
  clearPeerNotes(state, index, digit, pending);
  const mistake = options.trackMistakes && String(digit) !== state.solution[index];
  return commit(state, changesFrom(state, pending), now, mistake ? { mistakes: state.mistakes + 1 } : {});
}

/** Erases a player's digit, or, in an empty cell, its pencil marks. */
export function clearCell(state: GameState, index: number, now: number): GameState {
  if (!isEditable(state, index)) return state;
  const cell = state.cells[index];
  return commit(state, [{ index, before: cell, after: EMPTY_CELL }], now);
}

export function undo(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const move = state.undoStack[state.undoStack.length - 1];
  if (!move) return state;
  const cells = state.cells.slice();
  for (const c of move.changes) cells[c.index] = c.before;
  return { ...state, cells, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, move] };
}

export function redo(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const move = state.redoStack[state.redoStack.length - 1];
  if (!move) return state;
  const cells = state.cells.slice();
  for (const c of move.changes) cells[c.index] = c.after;
  return { ...state, cells, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, move] };
}

/** Fills every empty cell's pencil marks with the digits its row, column and box still allow. One undoable step. */
export function fillCandidates(state: GameState, now: number): GameState {
  if (state.status !== "playing") return state;
  const values = valuesOf(state.cells);
  const changes: CellChange[] = [];
  state.cells.forEach((cell, index) => {
    if (cell.value !== 0) return;
    changes.push({ index, before: cell, after: { ...cell, notes: candidatesOf(values, index) } });
  });
  return commit(state, changes, now);
}

// ---------------------------------------------------------------------------
// Assistance
// ---------------------------------------------------------------------------

/** A cell that is not (yet) right: empty, or holding a digit other than the solution's. */
const isUnsolved = (state: GameState, index: number): boolean => String(state.cells[index].value) !== state.solution[index];

/**
 * The cell a hint should reveal: the selected one if it is still wrong or empty and can be edited; otherwise the
 * unsolved cell with the fewest possibilities (the one a solver would look at next), counting only digits that are
 * actually correct on the board.
 */
export function hintTarget(state: GameState, selected: number | null): number | null {
  if (selected !== null && isEditable(state, selected) && isUnsolved(state, selected)) return selected;
  const trusted = state.cells.map((c, i) => (String(c.value) === state.solution[i] ? c.value : 0));
  let best: number | null = null;
  let bestCount = 10;
  for (let i = 0; i < CELLS; i++) {
    if (!isEditable(state, i) || !isUnsolved(state, i)) continue;
    let mask = candidatesOf(trusted, i);
    let count = 0;
    for (; mask; mask &= mask - 1) count++;
    if (count < bestCount) {
      best = i;
      bestCount = count;
    }
  }
  return best;
}

/** Reveals the correct digit in a cell (see `hintTarget`) and counts the hint. Returns the cell that was filled. */
export function giveHint(state: GameState, selected: number | null, now: number): { state: GameState; index: number | null } {
  if (state.status !== "playing") return { state, index: null };
  const index = hintTarget(state, selected);
  if (index === null) return { state, index: null };
  const digit = Number(state.solution[index]);
  const pending = new Map<number, CellState>([[index, { value: digit, notes: 0, hinted: true }]]);
  clearPeerNotes(state, index, digit, pending);
  return { state: commit(state, changesFrom(state, pending), now, { hintsUsed: state.hintsUsed + 1 }), index };
}

export interface CheckResult {
  /** Cells whose digit repeats in their row, column or box. */
  conflicts: number[];
  /** Cells holding a digit that differs from the solution. */
  incorrect: number[];
  /** Entered cells that are all correct; empty cells may remain. */
  ok: boolean;
  /** Cells still empty. */
  empty: number;
}

/** Validates the board against the rules and the solution. */
export function checkBoard(state: Pick<GameState, "cells" | "solution">): CheckResult {
  const values = valuesOf(state.cells);
  const conflicts = findConflicts(values).flatMap((c, i) => (c ? [i] : []));
  const incorrect = values.flatMap((v, i) => (v !== 0 && String(v) !== state.solution[i] ? [i] : []));
  return { conflicts, incorrect, ok: incorrect.length === 0 && conflicts.length === 0, empty: values.filter((v) => v === 0).length };
}

/** Fills in the whole solution and ends the game; it does not count as solved. */
export function revealSolution(state: GameState, now: number): GameState {
  if (state.status === "completed" || state.status === "revealed") return state;
  return {
    ...state,
    cells: state.cells.map((c, i) => ({ value: Number(state.solution[i]), notes: 0, hinted: c.hinted })),
    status: "revealed",
    elapsedMs: elapsedAt(state, now),
    resumedAt: null,
    endedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Whether a game has been touched enough to count as an attempt if it is abandoned. */
export const hasProgress = (state: GameState): boolean => state.undoStack.length > 0 || state.hintsUsed > 0;

/** What is saved when a game ends (solved, revealed) or is given up. `completed` is true only for a real solve. */
export function toSessionData(state: GameState, now: number): SessionData {
  return {
    clientId: state.clientId,
    startedAt: state.startedAt,
    endedAt: state.endedAt ?? now,
    difficulty: state.difficulty,
    puzzle: state.puzzle,
    completed: state.status === "completed",
    elapsedMs: elapsedAt(state, state.endedAt ?? now),
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  };
}

/** How many of each digit are on the board, to show how many are left to place. */
export function digitCounts(cells: readonly CellState[]): number[] {
  const counts = new Array<number>(10).fill(0);
  for (const c of cells) counts[c.value]++;
  return counts;
}
