import type { LocalStore } from "@/features/offline/lib/guest/api";
import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { dataOrNull, isClientId, isObject } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { hasMoves, highestTileOf, isPowerOfTwo } from "./engine";
import { parseSessionData, MAX_SCORE } from "./records";
import { CELLS, MAX_TILE, WIN_TILE, type GameState, type Grid, type SessionData, type Snapshot } from "./types";

/**
 * 2048 data on this device: games that ended or were given up (kept and uploaded like the other games' history, see
 * `src/features/games/shared/lib/history/local.ts`), the one unfinished game, and the best score.
 */

export type StoredSession = Stored<SessionData>;

export const game2048History = createLocalHistory<SessionData>({
  suffix: "game2048",
  parse: dataOrNull(parseSessionData),
});

export const loadHistory = game2048History.load;
export const saveSession = game2048History.save;

const gameKey = (store: LocalStore): string => `${store.key}:game2048:game`;
const bestKey = (store: LocalStore): string => `${store.key}:game2048:best`;

/** A board of 16 cells holding only empty or power-of-two tiles the board can reach, or null. */
function parseGrid(raw: unknown): Grid | null {
  if (!Array.isArray(raw) || raw.length !== CELLS) return null;
  if (!raw.every((v) => v === 0 || (isPowerOfTwo(v) && v <= MAX_TILE))) return null;
  return raw as Grid;
}

function parseSnapshot(raw: unknown): Snapshot | null {
  if (!isObject(raw)) return null;
  const grid = parseGrid(raw.grid);
  const { score, best, moves, highestTile, reached2048, continued, status } = raw;
  if (!grid || !isIntInRange(score, 0, MAX_SCORE) || !isIntInRange(best, 0, MAX_SCORE) || !isIntInRange(moves, 0, 200_000) || !isIntInRange(highestTile, 0, MAX_TILE)) return null;
  if (typeof reached2048 !== "boolean" || typeof continued !== "boolean" || (status !== "playing" && status !== "won")) return null;
  return { grid, score, best, moves, highestTile, reached2048, continued, status };
}

/**
 * A strictly validated game from untrusted stored data, or null. The clock always comes back stopped. A game with
 * no move left, or one that has already ended, is not an unfinished game and is not restored.
 */
export function parseGame(raw: unknown): GameState | null {
  if (!isObject(raw)) return null;
  const { clientId, score, best, moves, highestTile, reached2048, continued, status, undosUsed, startedAt, elapsedMs } = raw;
  const grid = parseGrid(raw.grid);
  if (!isClientId(clientId) || !grid) return null;
  if (!isIntInRange(score, 0, MAX_SCORE) || !isIntInRange(best, 0, MAX_SCORE) || !isIntInRange(moves, 0, 200_000) || !isIntInRange(undosUsed, 0, 200_000)) return null;
  if (!isIntInRange(highestTile, 0, MAX_TILE) || highestTile < highestTileOf(grid)) return null;
  if (typeof reached2048 !== "boolean" || typeof continued !== "boolean") return null;
  if (status !== "playing" && status !== "won") return null;
  if (reached2048 !== highestTile >= WIN_TILE) return null;
  if (status === "won" && !reached2048) return null;
  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt <= 0) return null;
  if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0) return null;
  if (best < score) return null;
  if (!hasMoves(grid) && status === "playing") return null;

  let previous: Snapshot | null = null;
  if (raw.previous !== null && raw.previous !== undefined) {
    previous = parseSnapshot(raw.previous);
    if (!previous) return null;
  }
  return { clientId, grid, score, best, moves, highestTile, reached2048, continued, status, previous, undosUsed, startedAt, endedAt: null, elapsedMs, resumedAt: null };
}

export function loadGame(store: LocalStore): GameState | null {
  try {
    return parseGame(JSON.parse(localStorage.getItem(gameKey(store)) ?? "null"));
  } catch {
    return null;
  }
}

/** Saves the unfinished game; the caller passes it through `freezeForStorage` first so the clock is banked. */
export function saveGame(store: LocalStore, game: GameState): boolean {
  try {
    localStorage.setItem(gameKey(store), JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}

export function clearGame(store: LocalStore): void {
  try {
    localStorage.removeItem(gameKey(store));
  } catch {
    // Nothing to forget.
  }
}

/**
 * The best score, or null if none was ever stored (a fresh device, where it can be taken from the history instead).
 * A stored 0 is a real value: it is what "Reset best score" leaves, and it is not refilled from the history.
 */
export function loadBest(store: LocalStore): number | null {
  try {
    const raw = localStorage.getItem(bestKey(store));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= MAX_SCORE ? value : null;
  } catch {
    return null;
  }
}

export function saveBest(store: LocalStore, best: number): void {
  try {
    localStorage.setItem(bestKey(store), String(best));
  } catch {
    // The best score is also in the history of finished games.
  }
}
