/**
 * What Queens and Zip (and any later puzzle game with Easy to Expert levels) have in common: the levels, a clock
 * format, ids for new games, and the score formula. Sudoku keeps its own copies of the same ideas.
 */

export const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };

export const isDifficulty = (value: unknown): value is Difficulty => DIFFICULTIES.includes(value as Difficulty);

/** "12:05" or "1:02:09". */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** A random id for a new game; also the key that makes saving and uploading it idempotent. */
export const newClientId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const TIME_BONUS_SHARE = 0.5;
const HINT_SHARE = 0.03;
const HINT_CAP = 0.25;

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  hintPenalty: number;
  total: number;
}

/**
 * Points for a solved puzzle. Every part is shown on the results screen:
 *
 *   base         what the difficulty is worth
 *   time bonus   up to half the base, shrinking to nothing at twice the par time
 *   hints        3% of the base each, at most 25% (small on purpose: hints are a normal way to practise)
 *
 * A puzzle that was not solved scores nothing.
 */
export function scorePuzzle({ base, parMs, completed, elapsedMs, hintsUsed }: { base: number; parMs: number; completed: boolean; elapsedMs: number; hintsUsed: number }): ScoreBreakdown {
  if (!completed) return { base: 0, timeBonus: 0, hintPenalty: 0, total: 0 };
  const remaining = Math.max(0, 1 - elapsedMs / (2 * parMs));
  const timeBonus = Math.round(base * TIME_BONUS_SHARE * remaining);
  const hintPenalty = Math.round(base * Math.min(HINT_CAP, HINT_SHARE * hintsUsed));
  return { base, timeBonus, hintPenalty, total: base + timeBonus - hintPenalty };
}

/** The most a puzzle with this base can earn. */
export const maxPuzzleScore = (base: number): number => Math.round(base * (1 + TIME_BONUS_SHARE));
