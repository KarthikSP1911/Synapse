import type { LocalStore } from "@/features/offline/lib/guest/api";
import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { isDifficulty, type Difficulty } from "@/features/games/shared/lib/puzzle-session";
import { patchesCounts } from "@/features/progress/lib/streak";
import { dataOrNull, isClientId, isObject } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { MAX_HISTORY, isComplete } from "./game";
import { cellCount, parsePuzzle } from "./puzzle-format";
import { parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import { checkDraft } from "./rules";
import { solvePuzzle } from "./solver";
import { DEFAULT_SETTINGS, type GameState, type Patch, type PatchesPuzzle, type PatchesSettings, type SessionData } from "./types";

/**
 * Patches data on this device: finished and abandoned games (kept and uploaded like the other games' history, see
 * `src/features/games/shared/lib/history/local.ts`), the one unfinished game, and the player's settings.
 */

export type StoredSession = Stored<SessionData>;

export const patchesHistory = createLocalHistory<SessionData>({
  suffix: "patches",
  parse: dataOrNull(parseSessionData),
  countsAsActivity: patchesCounts,
  grants: sessionGrants,
});

export const loadHistory = patchesHistory.load;
export const saveSession = patchesHistory.save;

// ---------------------------------------------------------------------------
// The unfinished game. One per viewer, next to their history: a guest's stays in the browser, an account's is a
// copy for this device only (it is not uploaded; only games that end are).
// ---------------------------------------------------------------------------

const gameKey = (store: LocalStore): string => `${store.key}:patches:game`;

/** A list of patches, each valid for its clue, none overlapping and none repeating a clue; null if it is anything else. */
function parsePatches(raw: unknown, puzzle: PatchesPuzzle): Patch[] | null {
  if (!Array.isArray(raw) || raw.length > puzzle.clues.length) return null;
  const n = cellCount(puzzle);
  const taken = new Set<number>();
  const used = new Set<number>();
  const none = new Int16Array(n).fill(-1);
  const patches: Patch[] = [];
  for (const item of raw) {
    if (!isObject(item) || !isIntInRange(item.clue, 0, puzzle.clues.length - 1) || !Array.isArray(item.cells) || item.cells.length === 0 || item.cells.length > n) return null;
    const cells = item.cells;
    for (let i = 0; i < cells.length; i++) {
      if (!isIntInRange(cells[i], 0, n - 1) || (i > 0 && cells[i] <= cells[i - 1])) return null;
    }
    const check = checkDraft(puzzle, none, cells as number[]);
    if (!check.ok || check.clue !== item.clue || used.has(item.clue as number)) return null;
    for (const cell of cells as number[]) {
      if (taken.has(cell)) return null;
      taken.add(cell);
    }
    used.add(item.clue as number);
    patches.push({ clue: item.clue as number, cells: cells as number[] });
  }
  return patches;
}

/** A strictly validated game from untrusted stored data, or null. The clock always comes back stopped (paused). */
export function parseGame(raw: unknown): GameState | null {
  if (!isObject(raw)) return null;
  const { clientId, difficulty, puzzle, solution, patches, undoStack, redoStack, hintsUsed, status, startedAt, elapsedMs } = raw;
  if (!isClientId(clientId) || !isDifficulty(difficulty)) return null;
  const parsed = parsePuzzle(puzzle);
  if (!parsed) return null;
  const cells = cellCount(parsed);
  // The stored solution must be the puzzle's one solution: a changed puzzle or solution is refused.
  if (!Array.isArray(solution) || solution.length !== cells || !solution.every((c) => isIntInRange(c, 0, parsed.clues.length - 1))) return null;
  const check = solvePuzzle(parsed);
  if (check.exceeded || check.count !== 1 || check.first?.some((c, i) => c !== solution[i])) return null;

  const placed = parsePatches(patches, parsed);
  if (!placed) return null;
  if (!Array.isArray(undoStack) || !Array.isArray(redoStack) || undoStack.length > MAX_HISTORY || redoStack.length > MAX_HISTORY) return null;
  const undos: Patch[][] = [];
  for (const entry of undoStack) {
    const list = parsePatches(entry, parsed);
    if (!list) return null;
    undos.push(list);
  }
  const redos: Patch[][] = [];
  for (const entry of redoStack) {
    const list = parsePatches(entry, parsed);
    if (!list) return null;
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
    solution: solution as number[],
    patches: placed,
    undoStack: undos,
    redoStack: redos,
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
    localStorage.setItem(gameKey(store), JSON.stringify({ ...game, hint: null }));
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

const SETTINGS_KEY = "mathz:patches:settings";
const DIFFICULTY_KEY = "mathz:patches:difficulty";

export function loadSettings(): PatchesSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (isObject(raw)) {
      return {
        autoCheck: typeof raw.autoCheck === "boolean" ? raw.autoCheck : DEFAULT_SETTINGS.autoCheck,
        showRemaining: typeof raw.showRemaining === "boolean" ? raw.showRemaining : DEFAULT_SETTINGS.showRemaining,
        larger: typeof raw.larger === "boolean" ? raw.larger : DEFAULT_SETTINGS.larger,
      };
    }
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: PatchesSettings): void {
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
