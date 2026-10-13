import type { Rng } from "@/lib/random";
import { hasMoves, highestTileOf, moveGrid, spawnTile, startingGrid } from "./engine";
import { WIN_TILE, type Direction, type GameState, type MoveResult, type SessionData, type Snapshot } from "./types";

/**
 * Rules of a game in progress. Every function takes a state and returns a new one (the same object when nothing
 * changed); the clock is passed in as `now` and the randomness as `rng`, so all of it can be tested without a browser.
 *
 * Undo policy: one step. After any move that changed the board, `undo` puts back the board, score, best score, move
 * count and win state from just before it, including leaving the "you won" screen. The step is used up by undoing; it
 * cannot be chained, and a new game has none. Undos are counted and saved with the game. Once the game is over it is
 * final (it has been recorded), so there is no undo from there.
 */

export function newGame(clientId: string, now: number, rng: Rng, best = 0): GameState {
  const grid = startingGrid(rng);
  return {
    clientId,
    grid,
    score: 0,
    best,
    moves: 0,
    highestTile: highestTileOf(grid),
    reached2048: false,
    continued: false,
    status: "playing",
    previous: null,
    undosUsed: 0,
    startedAt: now,
    endedAt: null,
    elapsedMs: 0,
    resumedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export const elapsedAt = (state: Pick<GameState, "elapsedMs" | "resumedAt">, now: number): number => state.elapsedMs + (state.resumedAt === null ? 0 : Math.max(0, now - state.resumedAt));

/** Banks the running time and stops the clock (the page was hidden, or the game ended). */
export function stopClock(state: GameState, now: number): GameState {
  return state.resumedAt === null ? state : { ...state, elapsedMs: elapsedAt(state, now), resumedAt: null };
}

/** Starts the clock again; a finished game's clock stays stopped. */
export function startClock(state: GameState, now: number): GameState {
  return state.resumedAt !== null || state.status === "over" ? state : { ...state, resumedAt: now };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

interface MoveOutcome {
  state: GameState;
  /** What moved, for animation; null when the move did nothing. */
  result: MoveResult | null;
  /** The tile that appeared after the move. */
  spawn: { index: number; value: number } | null;
}

const snapshotOf = (s: GameState): Snapshot => ({
  grid: s.grid,
  score: s.score,
  best: s.best,
  moves: s.moves,
  highestTile: s.highestTile,
  reached2048: s.reached2048,
  continued: s.continued,
  status: s.status,
});

/**
 * Plays one move. A move that changes nothing returns the same state: no tile appears, the score stays and there is
 * nothing to undo. Otherwise the tiles slide and merge, the score grows by the merged tiles, one new tile appears,
 * and the game may be won (first 2048 tile) or over (board full and nothing left to merge).
 */
export function applyMove(state: GameState, direction: Direction, now: number, rng: Rng): MoveOutcome {
  if (state.status !== "playing") return { state, result: null, spawn: null };
  const result = moveGrid(state.grid, direction);
  if (!result.moved) return { state, result: null, spawn: null };

  const spawn = spawnTile(result.grid, rng);
  const grid = spawn ? spawn.grid : result.grid;
  const score = state.score + result.gained;
  const reachedNow = !state.reached2048 && highestTileOf(result.grid) >= WIN_TILE;
  const status = reachedNow ? "won" : hasMoves(grid) ? "playing" : "over";

  let next: GameState = {
    ...state,
    grid,
    score,
    best: Math.max(state.best, score),
    moves: state.moves + 1,
    highestTile: Math.max(state.highestTile, highestTileOf(grid)),
    reached2048: state.reached2048 || reachedNow,
    status,
    previous: snapshotOf(state),
  };
  if (status === "over") next = { ...stopClock(next, now), endedAt: now };
  return { state: next, result, spawn: spawn ? { index: spawn.index, value: spawn.value } : null };
}

/** Takes back the last move (see the undo policy above). */
export function undo(state: GameState, now: number): GameState {
  const p = state.previous;
  if (!p || state.status === "over") return state;
  return {
    ...state,
    grid: p.grid,
    score: p.score,
    best: p.best,
    moves: p.moves,
    highestTile: p.highestTile,
    reached2048: p.reached2048,
    continued: p.continued,
    status: p.status,
    previous: null,
    undosUsed: state.undosUsed + 1,
    endedAt: null,
    resumedAt: state.resumedAt ?? now,
  };
}

/** After reaching 2048: keep playing with the same board and score. */
export function continuePlaying(state: GameState, now: number): GameState {
  if (state.status !== "won") return state;
  const status = hasMoves(state.grid) ? "playing" : "over";
  const next: GameState = { ...state, continued: true, status };
  return status === "over" ? { ...stopClock(next, now), endedAt: now } : next;
}

/**
 * Raises the best score to at least `best` (for example one kept from earlier games), in the position and in the one
 * undo would go back to, so undoing can never show a best below what is already on record.
 */
export function liftBest(state: GameState, best: number): GameState {
  if (best <= state.best && (!state.previous || best <= state.previous.best)) return state;
  return { ...state, best: Math.max(state.best, best), previous: state.previous && { ...state.previous, best: Math.max(state.previous.best, best) } };
}

/**
 * Forgets the best score: it falls back to the score of the game being played (the best can never be below it), and
 * the undo step is changed to match so that undoing does not bring the old best back.
 */
export function resetBest(state: GameState): GameState {
  return { ...state, best: state.score, previous: state.previous && { ...state.previous, best: state.previous.score } };
}

/** The state as it should be written to storage: a running clock is banked, so time while closed is not counted. */
export const freezeForStorage = (state: GameState, now: number): GameState => stopClock(state, now);

/** Whether giving this game up should count as a game played. */
export const hasProgress = (state: GameState): boolean => state.moves > 0;

/** What is saved when a game ends or is given up. */
export function toSessionData(state: GameState, now: number): SessionData {
  const endedAt = state.endedAt ?? now;
  return {
    clientId: state.clientId,
    startedAt: state.startedAt,
    endedAt,
    score: state.score,
    highestTile: Math.max(state.highestTile, highestTileOf(state.grid)),
    moves: state.moves,
    durationMs: elapsedAt(state, endedAt),
    reached2048: state.reached2048,
    gameOver: state.status === "over",
    undosUsed: state.undosUsed,
  };
}
