import type { LocalStore } from "@/features/offline/lib/guest/api";
import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { isDifficulty, type Difficulty } from "@/features/games/shared/lib/puzzle-session";
import { queensCounts } from "@/features/progress/lib/streak";
import { dataOrNull, isClientId, isObject } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { MAX_HISTORY, isComplete } from "./game";
import { isSolution, parseRegions } from "./grid";
import { parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import { countSolutions } from "./solver";
import { DEFAULT_SETTINGS, HINTED, type GameState, type Mark, type Move, type QueensSettings, type SessionData } from "./types";

/**
 * Queens data on this device: finished and abandoned games (kept and uploaded like the other games' history, see
 * `src/features/games/shared/lib/history/local.ts`), the one unfinished game, and the player's settings.
 */

export type StoredSession = Stored<SessionData>;

export const queensHistory = createLocalHistory<SessionData>({
  suffix: "queens",
  parse: dataOrNull(parseSessionData),
  countsAsActivity: queensCounts,
  grants: sessionGrants,
});

export const loadHistory = queensHistory.load;
export const saveSession = queensHistory.save;

// ---------------------------------------------------------------------------
// The unfinished game. One per viewer, next to their history: a guest's stays in the browser, an account's is a
// copy for this device only (it is not uploaded; only games that end are).
// ---------------------------------------------------------------------------

const gameKey = (store: LocalStore): string => `${store.key}:queens:game`;

const isMark = (v: unknown): v is Mark => v === 0 || v === 1 || v === 2 || v === 3;

function parseMoves(raw: unknown, cellCount: number): Move[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
  const moves: Move[] = [];
  for (const m of raw) {
    if (!isObject(m) || !Array.isArray(m.changes) || m.changes.length > cellCount) return null;
    const changes = [];
    for (const c of m.changes) {
      if (!isObject(c) || !isIntInRange(c.index, 0, cellCount - 1) || !isMark(c.before) || !isMark(c.after)) return null;
      changes.push({ index: c.index, before: c.before, after: c.after });
    }
    moves.push({ changes });
  }
  return moves;
}

/** A strictly validated game from untrusted stored data, or null. The clock always comes back stopped (paused). */
export function parseGame(raw: unknown): GameState | null {
  if (!isObject(raw)) return null;
  const { clientId, difficulty, regions, solution, cells, undoStack, redoStack, hintsUsed, status, startedAt, elapsedMs } = raw;
  if (!isClientId(clientId) || !isDifficulty(difficulty)) return null;
  const board = parseRegions(regions);
  if (!board || typeof solution !== "string" || !/^[0-9]+$/.test(solution)) return null;
  const answer = Array.from(solution, Number);
  if (!isSolution(board, answer) || countSolutions(board, 2) !== 1) return null;
  const count = board.n * board.n;
  if (!Array.isArray(cells) || cells.length !== count) return null;
  const parsed: Mark[] = [];
  for (const [i, m] of cells.entries()) {
    if (!isMark(m)) return null;
    // A revealed queen is always a right one.
    if (m === HINTED && answer[Math.floor(i / board.n)] !== i % board.n) return null;
    parsed.push(m);
  }
  const undos = parseMoves(undoStack, count);
  const redos = parseMoves(redoStack, count);
  if (!undos || !redos || !isIntInRange(hintsUsed, 0, 10_000)) return null;
  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt <= 0) return null;
  if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0) return null;
  if (status !== "playing" && status !== "paused") return null;

  const game: GameState = {
    clientId,
    difficulty,
    size: board.n,
    regions: regions as string,
    solution,
    cells: parsed,
    undoStack: undos,
    redoStack: redos,
    hintsUsed: hintsUsed as number,
    hint: null,
    lastEdit: null,
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
    localStorage.setItem(gameKey(store), JSON.stringify({ ...game, hint: null, lastEdit: null }));
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

const SETTINGS_KEY = "mathz:queens:settings";
const DIFFICULTY_KEY = "mathz:queens:difficulty";

export function loadSettings(): QueensSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (isObject(raw)) return { autoCheck: typeof raw.autoCheck === "boolean" ? raw.autoCheck : DEFAULT_SETTINGS.autoCheck };
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: QueensSettings): void {
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
