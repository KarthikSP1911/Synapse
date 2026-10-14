import { elapsedAt, freezeClock, pauseClock, resumeClock, stopClock } from "@/features/games/shared/lib/clock";
import { cellCount, parsePuzzle } from "./puzzle-format";
import { canPlace, checkDraft, overlappedClues, ownerMap, ownerWithout, validateBoard, type DraftCheck } from "./rules";
import { buildModel, loadPatches, type Model } from "./solver";
import type { GameState, Patch, PatchesPuzzle, Puzzle, SessionData } from "./types";

/**
 * Rules of a Patches game in progress. Every function takes a state and returns a new one (or the same object when
 * nothing changed), and the clock is passed in as `now`, so all of it can be tested without a browser.
 *
 * The state holds only what is true of the board: the patches, in the order they were drawn, and the history for
 * Undo. What is half drawn, selected, animating or highlighted is the screen's business (see draw.ts), so animation
 * timing can never change what is saved or whether the puzzle counts as solved.
 */

/** Undo history is kept for this many steps; older ones are forgotten. */
export const MAX_HISTORY = 60;

export { elapsedAt };
export const pauseGame = pauseClock<GameState>;
export const resumeGame = resumeClock<GameState>;
export const freezeForStorage = freezeClock<GameState>;

const parsedCache = new Map<string, { puzzle: PatchesPuzzle; model: Model | null }>();

/** A puzzle text turned into the puzzle and (lazily built) candidate model, cached because the screen asks on every change. */
function cached(text: string): { puzzle: PatchesPuzzle; model: Model | null } {
  let entry = parsedCache.get(text);
  if (!entry) {
    const puzzle = parsePuzzle(text);
    if (!puzzle) throw new Error("Invalid puzzle");
    entry = { puzzle, model: buildModel(puzzle) };
    if (parsedCache.size > 6) parsedCache.clear();
    parsedCache.set(text, entry);
  }
  return entry;
}

export const puzzleFor = (text: string): PatchesPuzzle => cached(text).puzzle;

/** The candidate patches of a puzzle text. Throws for one too big to enumerate (the generator never makes one). */
export function modelFor(text: string): Model {
  const { model } = cached(text);
  if (!model) throw new Error("Puzzle too large");
  return model;
}

export function newGame(puzzle: Puzzle, clientId: string, now: number): GameState {
  modelFor(puzzle.puzzle);
  return {
    clientId,
    difficulty: puzzle.difficulty,
    puzzle: puzzle.puzzle,
    solution: puzzle.solution,
    patches: [],
    undoStack: [],
    redoStack: [],
    hintsUsed: 0,
    hint: null,
    status: "playing",
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    resumedAt: now,
  };
}

/** The same puzzle from the start: patches, hints and the clock cleared. The game keeps its id, so it can only ever be recorded once. */
export const restartGame = (state: GameState, now: number): GameState => newGame({ difficulty: state.difficulty, puzzle: state.puzzle, solution: state.solution }, state.clientId, now);

const playing = (state: GameState): boolean => state.status === "playing";

/** Cells no patch covers yet. */
export const remaining = (state: Pick<GameState, "patches" | "puzzle">): number => cellCount(puzzleFor(state.puzzle)) - state.patches.reduce((n, p) => n + p.cells.length, 0);

/** Whether the patches divide the board correctly (the one definition of solved, in rules.ts). */
export const isComplete = (state: Pick<GameState, "patches" | "puzzle">): boolean => validateBoard(puzzleFor(state.puzzle), state.patches).solved;

// ---------------------------------------------------------------------------
// Changing the board
// ---------------------------------------------------------------------------

/** Files `patches` as the new board: one undo step, the redo history gone, any hint gone; the clock stops when it is solved. */
function withPatches(state: GameState, patches: Patch[], now: number): GameState {
  const next: GameState = {
    ...state,
    patches,
    hint: null,
    undoStack: [...state.undoStack, state.patches].slice(-MAX_HISTORY),
    redoStack: [],
  };
  return isComplete(next) ? stopClock(next, now) : next;
}

export interface Committed {
  state: GameState;
  /** Why the cells were refused, or null when the patch was placed. */
  refused: DraftCheck | null;
}

/**
 * Places the cells as a patch. The rules are checked here again, whatever the screen thought. A patch that is no
 * patch at all (no clue, two clues, cells that do not touch) changes nothing. One whose area or shape is not what its
 * clue asks is placed anyway and can be adjusted or redrawn: only a board where every patch is right counts as solved.
 *
 * Drawing over patches that are already there replaces them (that is how a wrong patch is redrawn without
 * removing it first), but only when the new patch is valid: a refused patch takes nothing off the board. The
 * replacement and the new patch are one undo step. An identical patch changes nothing.
 */
export function commitPatch(state: GameState, cells: readonly number[], now: number): Committed {
  if (!playing(state)) return { state, refused: null };
  const puzzle = puzzleFor(state.puzzle);
  const owner = ownerMap(state.patches, cellCount(puzzle));
  const covered = overlappedClues(owner, cells);
  const check = checkDraft(puzzle, ownerWithout(owner, covered), cells);
  if (!canPlace(check) || check.clue === null) return { state, refused: check };
  const patch: Patch = { clue: check.clue, cells: [...cells].sort((a, b) => a - b) };
  const same = state.patches.find((p) => p.clue === patch.clue);
  if (same && same.cells.length === patch.cells.length && same.cells.every((cell, i) => cell === patch.cells[i])) return { state, refused: null };
  return { state: withPatches(state, [...state.patches.filter((p) => !covered.includes(p.clue)), patch], now), refused: null };
}

/** Takes one patch off the board. */
export function removePatch(state: GameState, clue: number, now: number): GameState {
  if (!playing(state) || !state.patches.some((p) => p.clue === clue)) return state;
  return withPatches(
    state,
    state.patches.filter((p) => p.clue !== clue),
    now
  );
}

/** Takes every patch off the board, leaving the puzzle, the clock and the hints as they are. One undoable step. */
export function resetPatches(state: GameState, now: number): GameState {
  if (!playing(state) || state.patches.length === 0) return state;
  return withPatches(state, [], now);
}

export function undo(state: GameState): GameState {
  if (!playing(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  if (!previous) return state;
  return { ...state, patches: previous, hint: null, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, state.patches] };
}

export function redo(state: GameState): GameState {
  if (!playing(state)) return state;
  const next = state.redoStack[state.redoStack.length - 1];
  if (!next) return state;
  return { ...state, patches: next, hint: null, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, state.patches] };
}

// ---------------------------------------------------------------------------
// Looking at the board
// ---------------------------------------------------------------------------

export interface Conflicts {
  /** Clues without a patch that no longer have anywhere to go. */
  clues: number[];
  /** Cells that no remaining patch could cover. */
  cells: number[];
}

/**
 * Dead ends on the board as it stands: a clue that has no patch yet and no way left to draw one around the patches
 * already placed, or a free cell that nothing could still cover. It follows from the clues and the placed patches
 * alone (the hidden solution is not consulted), so it is the same check whether it runs by itself or on request.
 */
export function conflicts(state: Pick<GameState, "patches" | "puzzle">): Conflicts {
  const { model, state: s } = loadPatches(modelFor(state.puzzle), state.patches);

  const clues: number[] = [];
  const cells: number[] = [];
  const once = new Int32Array(model.words);
  for (let i = 0; i < model.cands.length; i++) {
    if (s.placed[i] >= 0) continue;
    let any = false;
    for (let index = 0; index < model.cands[i].length; index++) {
      const mask = model.cands[i][index].mask;
      let clash = false;
      for (let w = 0; w < model.words; w++) if ((mask[w] & s.covered[w]) !== 0) clash = true;
      if (clash) continue;
      any = true;
      for (let w = 0; w < model.words; w++) once[w] |= mask[w];
    }
    if (!any) clues.push(i);
  }
  for (let cell = 0; cell < model.n; cell++) {
    const open = (s.covered[cell >>> 5] & (1 << (cell & 31))) === 0;
    if (open && (once[cell >>> 5] & (1 << (cell & 31))) === 0) cells.push(cell);
  }
  return { clues, cells };
}

export interface Checked {
  solved: boolean;
  /** A sentence for the status line. */
  message: string;
  conflicts: Conflicts;
}

/** The Check button: validates the board by the rules and says what is missing or stuck. */
export function checkBoard(state: GameState): Checked {
  const puzzle = puzzleFor(state.puzzle);
  const board = validateBoard(puzzle, state.patches);
  const dead = conflicts(state);
  if (board.solved) return { solved: true, message: "Every cell is in a valid patch. Solved!", conflicts: dead };
  if (board.problems.length > 0) return { solved: false, message: board.problems[0], conflicts: dead };
  if (dead.clues.length > 0 || dead.cells.length > 0) {
    const clue = dead.clues[0];
    const where = clue !== undefined ? `The clue at ${rowColumn(puzzle.clues[clue].cell, puzzle.cols)} has no room left for its patch.` : `The cell at ${rowColumn(dead.cells[0], puzzle.cols)} can no longer be covered.`;
    return { solved: false, message: `${where} Remove a patch near it.`, conflicts: dead };
  }
  const left = board.uncovered;
  return { solved: false, message: `No conflicts so far. ${left} ${left === 1 ? "cell is" : "cells are"} still to cover.`, conflicts: dead };
}

const rowColumn = (cell: number, cols: number): string => `row ${Math.floor(cell / cols) + 1}, column ${(cell % cols) + 1}`;

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Whether a game has been touched enough to count as an attempt if it is abandoned. */
export const hasProgress = (state: GameState): boolean => state.patches.length > 0 || state.undoStack.length > 0 || state.hintsUsed > 0;

/** What is saved when a game ends (solved) or is given up. `completed` is true only for a real solve. */
export function toSessionData(state: GameState, now: number): SessionData {
  return {
    clientId: state.clientId,
    startedAt: state.startedAt,
    endedAt: state.endedAt ?? now,
    difficulty: state.difficulty,
    puzzle: state.puzzle,
    completed: state.status === "completed",
    elapsedMs: elapsedAt(state, state.endedAt ?? now),
    hintsUsed: state.hintsUsed,
  };
}
