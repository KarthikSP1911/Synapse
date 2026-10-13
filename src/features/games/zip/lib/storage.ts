import type { LocalStore } from "@/features/offline/lib/guest/api";
import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { isDifficulty, type Difficulty } from "@/features/games/shared/lib/puzzle-session";
import { zipCounts } from "@/features/progress/lib/streak";
import { dataOrNull, isClientId, isObject } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { MAX_HISTORY, isComplete, rulesFor } from "./game";
import { validatePath } from "./draw";
import { cellCount, parsePuzzle } from "./puzzle-format";
import { parseSessionData } from "./records";
import { solvePuzzle } from "./solver";
import { DEFAULT_SETTINGS, type GameState, type SessionData, type ZipSettings } from "./types";

/**
 * Zip data on this device: finished and abandoned games (kept and uploaded like the other games' history, see
 * `src/features/games/shared/lib/history/local.ts`), the one unfinished game, and the player's settings.
 */

export type StoredSession = Stored<SessionData>;

export const zipHistory = createLocalHistory<SessionData>({
  suffix: "zip",
  parse: dataOrNull(parseSessionData),
  countsAsActivity: zipCounts,
});

export const loadHistory = zipHistory.load;
export const saveSession = zipHistory.save;

// ---------------------------------------------------------------------------
// The unfinished game. One per viewer, next to their history: a guest's stays in the browser, an account's is a
// copy for this device only (it is not uploaded; only games that end are).
// ---------------------------------------------------------------------------

const gameKey = (store: LocalStore): string => `${store.key}:zip:game`;

/** A list of cells, each below `cells`, as plain numbers; null if it is anything else. */
function parseCells(raw: unknown, cells: number, max: number): number[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  return raw.every((c) => isIntInRange(c, 0, cells - 1)) ? (raw as number[]) : null;
}

/** A strictly validated game from untrusted stored data, or null. The clock always comes back stopped (paused). */
export function parseGame(raw: unknown): GameState | null {
  if (!isObject(raw)) return null;
  const { clientId, difficulty, puzzle, solution, path, undoStack, redoStack, hintsUsed, status, startedAt, elapsedMs } = raw;
  if (!isClientId(clientId) || !isDifficulty(difficulty)) return null;
  const parsed = parsePuzzle(puzzle);
  if (!parsed) return null;
  const cells = cellCount(parsed);
  const rules = rulesFor(puzzle as string);
  const answer = parseCells(solution, cells, cells);
  // The stored solution must be a complete valid path, and the puzzle must have no other: a changed puzzle or solution is refused.
  if (!answer || answer.length !== cells || !validatePath(rules, answer)) return null;
  const check = solvePuzzle(parsed);
  if (check.exceeded || check.count !== 1 || check.first?.some((c, i) => c !== answer[i])) return null;
  const drawn = parseCells(path, cells, cells);
  if (!drawn || !validatePath(rules, drawn)) return null;
  if (!Array.isArray(undoStack) || !Array.isArray(redoStack) || undoStack.length > MAX_HISTORY || redoStack.length > MAX_HISTORY) return null;
  const undos: number[][] = [];
  for (const entry of undoStack) {
    const list = parseCells(entry, cells, cells);
    if (!list || !validatePath(rules, list)) return null;
    undos.push(list);
  }
  const redos: number[][] = [];
  for (const entry of redoStack) {
    const list = parseCells(entry, cells, cells);
    if (!list || !validatePath(rules, list)) return null;
    redos.push(list);
  }
  if (!isIntInRange(hintsUsed, 0, 10_000)) return null;
  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt <= 0) return null;
  if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0) return null;
  if (status !== "playing" && status !== "paused") return null;

  const game: GameState = {
    clientId,
    difficulty,
    puzzle: puzzle as string,
    solution: answer,
    path: drawn,
    undoStack: undos,
    redoStack: redos,
    stroke: null,
    hintsUsed: hintsUsed as number,
    hint: null,
    status: "paused",
    startedAt,
    endedAt: null,
    elapsedMs,
    resumedAt: null,
  };
  // A finished board is not an unfinished game.
  return isComplete(game) ? null : game;
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
    localStorage.setItem(gameKey(store), JSON.stringify({ ...game, hint: null, stroke: null }));
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

// ---------------------------------------------------------------------------
// Remembered choices
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "mathz:zip:settings";
const DIFFICULTY_KEY = "mathz:zip:difficulty";

export function loadSettings(): ZipSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (isObject(raw)) return { showRemaining: typeof raw.showRemaining === "boolean" ? raw.showRemaining : DEFAULT_SETTINGS.showRemaining };
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: ZipSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Remembering the settings is a convenience only.
  }
}

export function loadDifficulty(): Difficulty {
  try {
    const value = localStorage.getItem(DIFFICULTY_KEY);
    return isDifficulty(value) ? value : "easy";
  } catch {
    return "easy";
  }
}

export function saveDifficulty(difficulty: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Remembering the choice is a convenience only.
  }
}
