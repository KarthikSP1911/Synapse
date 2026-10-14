import { elapsedAt, freezeClock, pauseClock, resumeClock, stopClock } from "@/features/games/shared/lib/clock";
import { advance, canStep, explain, isComplete as pathComplete, reach, rulesOf, type Rules, type StepResult } from "./draw";
import { cellCount, parsePuzzle } from "./puzzle-format";
import type { GameState, Hint, Puzzle, SessionData } from "./types";

/**
 * Rules of a Zip game in progress. Every function takes a state and returns a new one (or the same object when
 * nothing changed), and the clock is passed in as `now`, so all of it can be tested without a browser.
 *
 * A stroke is one press-drag-release (or one key press). `beginStroke` remembers the path as it was, the stroke
 * changes the path as the pointer moves, and `endStroke` files the whole stroke as one undo step.
 */

/** Undo history is kept for this many strokes; older ones are forgotten. */
export const MAX_HISTORY = 60;
/** How many squares one hint adds. */
export const HINT_LENGTH = 3;

export { elapsedAt };
export const pauseGame = pauseClock<GameState>;
export const resumeGame = resumeClock<GameState>;
export const freezeForStorage = freezeClock<GameState>;

const rulesCache = new Map<string, Rules>();

/** The drawing rules of a puzzle text (cached: a game asks for them on every pointer move). */
export function rulesFor(puzzle: string): Rules {
  let rules = rulesCache.get(puzzle);
  if (!rules) {
    const parsed = parsePuzzle(puzzle);
    if (!parsed) throw new Error("Invalid puzzle");
    rules = rulesOf(parsed);
    if (rulesCache.size > 8) rulesCache.clear();
    rulesCache.set(puzzle, rules);
  }
  return rules;
}

export function newGame(puzzle: Puzzle, clientId: string, now: number): GameState {
  rulesFor(puzzle.puzzle);
  return {
    clientId,
    difficulty: puzzle.difficulty,
    puzzle: puzzle.puzzle,
    solution: puzzle.solution,
    path: [],
    undoStack: [],
    redoStack: [],
    stroke: null,
    hintsUsed: 0,
    hint: null,
    status: "playing",
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    resumedAt: now,
  };
}

/** The same puzzle from the start: path, hints and the clock cleared. The game keeps its id, so it can only ever be recorded once. */
export const restartGame = (state: GameState, now: number): GameState => newGame({ difficulty: state.difficulty, puzzle: state.puzzle, solution: state.solution }, state.clientId, now);

const playing = (state: GameState): boolean => state.status === "playing";
const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((c, i) => c === b[i]);

/** Squares still to fill. */
export const remaining = (state: Pick<GameState, "path" | "puzzle">): number => cellCount(rulesFor(state.puzzle).puzzle) - state.path.length;

/** The number the path is heading for, or null once the last one is reached. */
export function nextCheckpoint(state: Pick<GameState, "path" | "puzzle">): number | null {
  const rules = rulesFor(state.puzzle);
  let reached = 0;
  for (const cell of state.path) reached = Math.max(reached, rules.numbers[cell]);
  return reached >= rules.last ? null : reached + 1;
}

export const isComplete = (state: Pick<GameState, "path" | "puzzle">): boolean => pathComplete(rulesFor(state.puzzle), state.path);

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function withPath(state: GameState, path: readonly number[], now: number): GameState {
  if (path === state.path) return state;
  const next: GameState = { ...state, path: path as number[], hint: null };
  return pathComplete(rulesFor(state.puzzle), path) ? finish(next, now) : next;
}

/** Completes the game: the clock stops, and the stroke that did it is filed so Undo is still possible (until the end screen). */
function finish(state: GameState, now: number): GameState {
  const filed = endStroke(state);
  return stopClock(filed, now);
}

export interface Began {
  state: GameState;
  /** Why the press did not start or extend a path, or null when it did. */
  refused: Exclude<StepResult, { ok: true }>["reason"] | null;
}

/**
 * A press on a cell. On checkpoint 1 it starts the path; on the path's end it carries on from there; on an earlier
 * cell of the path it erases the path after that cell and carries on from it; on a neighbour of the end it extends
 * the path if the rules allow. Otherwise nothing changes.
 */
export function beginStroke(state: GameState, cell: number, now: number): Began {
  if (!playing(state) || state.stroke) return { state, refused: null };
  const rules = rulesFor(state.puzzle);
  const onPath = state.path.includes(cell);
  const attempt = onPath ? { ok: true as const } : canStep(rules, state.path, cell);
  if (!attempt.ok) return { state, refused: attempt.reason };
  const path = state.path.length === 0 ? [cell] : advance(rules, state.path, cell);
  const started: GameState = { ...state, stroke: state.path };
  return { state: withPath(started, path, now), refused: null };
}

/**
 * The pointer reached `cell` during a stroke: step back if it is the square just behind the end, extend towards it by
 * the shortest legal route, or ignore it. The path never crosses itself, so touching any other square of the path
 * does nothing (pressing on an earlier square to start a stroke there is `beginStroke`).
 */
export function dragTo(state: GameState, cell: number, now: number): Began {
  if (!playing(state) || !state.stroke) return { state, refused: null };
  const rules = rulesFor(state.puzzle);
  const path = reach(rules, state.path, cell);
  if (path === state.path) {
    // Say why a neighbouring square is closed; running over squares that are merely far is not worth a message.
    const why = canStep(rules, state.path, cell);
    return { state, refused: why && !why.ok && why.reason !== "far" && why.reason !== "start" ? why.reason : null };
  }
  return { state: withPath(state, path, now), refused: null };
}

/** The pointer was released (or the stroke was interrupted): the stroke becomes one undo step. */
export function endStroke(state: GameState): GameState {
  if (!state.stroke) return state;
  if (same(state.stroke, state.path)) return { ...state, stroke: null };
  return { ...state, stroke: null, undoStack: [...state.undoStack, state.stroke].slice(-MAX_HISTORY), redoStack: [] };
}

/** One step by keyboard: towards `cell`, or back along the path if it is the previous cell. One undo step each. */
export function stepTo(state: GameState, cell: number, now: number): Began {
  const began = beginStroke(state, cell, now);
  return { state: endStroke(began.state), refused: began.refused };
}

/** A message for a refused move. */
export const refusal = (state: GameState, reason: NonNullable<Began["refused"]>): string => explain(reason, rulesFor(state.puzzle), state.path);

/** Erases the whole path. One undoable step. */
export function clearPath(state: GameState): GameState {
  if (!playing(state) || state.path.length === 0) return state;
  const settled = endStroke(state);
  return { ...settled, path: [], hint: null, undoStack: [...settled.undoStack, settled.path].slice(-MAX_HISTORY), redoStack: [] };
}

export function undo(state: GameState): GameState {
  if (!playing(state) || state.stroke) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  if (!previous) return state;
  return { ...state, path: previous, hint: null, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, state.path] };
}

export function redo(state: GameState): GameState {
  if (!playing(state) || state.stroke) return state;
  const next = state.redoStack[state.redoStack.length - 1];
  if (!next) return state;
  return { ...state, path: next, hint: null, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, state.path] };
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

const place = (cell: number, cols: number): string => `row ${Math.floor(cell / cols) + 1}, column ${(cell % cols) + 1}`;

/**
 * One press of the Hint button, and each press counts as a hint. If the path has left the solution, it is cut back
 * to the last square that was right (with the first wrong square pointed out); otherwise the next few squares of
 * the solution are added. Either way it is one undo step.
 */
export function giveHint(state: GameState, now: number): GameState {
  if (!playing(state)) return state;
  const rules = rulesFor(state.puzzle);
  const settled = endStroke(state);
  let right = 0;
  while (right < settled.path.length && settled.path[right] === state.solution[right]) right++;
  const filed = (path: number[], hint: Hint): GameState => {
    const next: GameState = {
      ...settled,
      path,
      hint,
      hintsUsed: settled.hintsUsed + 1,
      undoStack: [...settled.undoStack, settled.path].slice(-MAX_HISTORY),
      redoStack: [],
    };
    return pathComplete(rules, path) ? stopClock({ ...next, hint: null }, now) : next;
  };
  if (right < settled.path.length) {
    const wrong = settled.path[right];
    return filed(settled.path.slice(0, right), { kind: "wrong", cells: [wrong], text: `The path went wrong at ${place(wrong, rules.puzzle.cols)}. It has been cut back to the last right square.` });
  }
  if (right >= state.solution.length) return state;
  const added = state.solution.slice(right, right + HINT_LENGTH);
  return filed(state.solution.slice(0, right + added.length), { kind: "next", cells: added, text: `Added the next ${added.length} ${added.length === 1 ? "square" : "squares"} of the solution.` });
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Whether a game has been touched enough to count as an attempt if it is abandoned. */
export const hasProgress = (state: GameState): boolean => state.undoStack.length > 0 || state.path.length > 1 || state.hintsUsed > 0;

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
