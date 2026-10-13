import type { LocalStore } from "@/features/offline/lib/guest/api";
import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { sudokuCounts } from "@/features/progress/lib/streak";
import { dataOrNull, isClientId, isObject } from "@/lib/records";
import { isIntInRange } from "@/lib/validation";
import { MAX_HISTORY, isComplete } from "./game";
import { isSolved, parseGrid } from "./grid";
import { parseSessionData } from "./records";
import { isDifficulty } from "./scoring";
import { CELLS, DEFAULT_SETTINGS, type CellState, type Difficulty, type GameState, type Move, type SessionData, type SudokuSettings } from "./types";

/**
 * Sudoku data on this device: finished and abandoned games (kept and uploaded like the other games' history, see
 * `src/features/games/shared/lib/history/local.ts`), the one unfinished game, and the player's settings.
 */

export type StoredSession = Stored<SessionData>;

export const sudokuHistory = createLocalHistory<SessionData>({
  suffix: "sudoku",
  parse: dataOrNull(parseSessionData),
  countsAsActivity: sudokuCounts,
});

export const loadHistory = sudokuHistory.load;
export const saveSession = sudokuHistory.save;

// ---------------------------------------------------------------------------
// The unfinished game. One per viewer, next to their history: a guest's stays in the browser, an account's is a
// copy for this device only (it is not uploaded; only games that end are).
// ---------------------------------------------------------------------------

const gameKey = (store: LocalStore): string => `${store.key}:sudoku:game`;

const isCount = (v: unknown): v is number => isIntInRange(v, 0, 10_000);

function parseCell(raw: unknown): CellState | null {
  if (!isObject(raw)) return null;
  const { value, notes, hinted } = raw;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 9) return null;
  if (!Number.isInteger(notes) || (notes as number) < 0 || (notes as number) > 0b111111111) return null;
  if (typeof hinted !== "boolean") return null;
  return { value: value as number, notes: notes as number, hinted };
}

function parseMoves(raw: unknown): Move[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
  const moves: Move[] = [];
  for (const m of raw) {
    if (!isObject(m) || !Array.isArray(m.changes)) return null;
    const changes = [];
    for (const c of m.changes) {
      if (!isObject(c) || !Number.isInteger(c.index) || (c.index as number) < 0 || (c.index as number) >= CELLS) return null;
      const before = parseCell(c.before);
      const after = parseCell(c.after);
      if (!before || !after) return null;
      changes.push({ index: c.index as number, before, after });
    }
    moves.push({ changes });
  }
  return moves;
}

/** A strictly validated game from untrusted stored data, or null. The clock always comes back stopped (paused). */
export function parseGame(raw: unknown): GameState | null {
  if (!isObject(raw)) return null;
  const { clientId, difficulty, puzzle, solution, cells, undoStack, redoStack, mistakes, hintsUsed, status, startedAt, elapsedMs } = raw;
  if (!isClientId(clientId) || !isDifficulty(difficulty)) return null;
  const clues = parseGrid(puzzle);
  const answer = parseGrid(solution);
  if (!clues || !answer || !isSolved(answer)) return null;
  if (clues.some((d, i) => d !== 0 && d !== answer[i])) return null;
  if (!Array.isArray(cells) || cells.length !== CELLS) return null;
  const parsed: CellState[] = [];
  for (const [i, c] of cells.entries()) {
    const cell = parseCell(c);
    // A clue is fixed; a hint is always the right digit.
    if (!cell || (clues[i] !== 0 && (cell.value !== clues[i] || cell.hinted))) return null;
    if (cell.hinted && cell.value !== answer[i]) return null;
    parsed.push(cell);
  }
  const undos = parseMoves(undoStack);
  const redos = parseMoves(redoStack);
  if (!undos || !redos || !isCount(mistakes) || !isCount(hintsUsed)) return null;
  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt) || startedAt <= 0) return null;
  if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0) return null;
  if (status !== "playing" && status !== "paused") return null;

  const game: GameState = {
    clientId,
    difficulty,
    puzzle: puzzle as string,
    solution: solution as string,
    cells: parsed,
    undoStack: undos,
    redoStack: redos,
    mistakes: mistakes as number,
    hintsUsed: hintsUsed as number,
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

// ---------------------------------------------------------------------------
// Remembered choices
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "mathz:sudoku:settings";
const DIFFICULTY_KEY = "mathz:sudoku:difficulty";

export function loadSettings(): SudokuSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (isObject(raw)) {
      return {
        highlight: raw.highlight === "check" ? "check" : DEFAULT_SETTINGS.highlight,
        trackMistakes: typeof raw.trackMistakes === "boolean" ? raw.trackMistakes : DEFAULT_SETTINGS.trackMistakes,
      };
    }
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: SudokuSettings): void {
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
