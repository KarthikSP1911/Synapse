import { DIFFICULTIES, type Difficulty, type SessionData } from "./types";

/**
 * Points for a solved puzzle. Every part is visible on the results screen:
 *
 *   base         what the difficulty is worth
 *   time bonus   up to half the base, shrinking to nothing at twice the par time
 *   mistakes     4% of the base each, at most 30%
 *   hints        3% of the base each, at most 25% (small on purpose: using hints is a normal way to practise)
 *
 * A puzzle that was not solved (given up, or the solution was revealed) scores nothing.
 */

export const BASE_POINTS: Record<Difficulty, number> = { easy: 500, medium: 1000, hard: 1750, expert: 2500 };
/** A comfortable solving time for each difficulty. */
export const PAR_MS: Record<Difficulty, number> = { easy: 5 * 60_000, medium: 8 * 60_000, hard: 12 * 60_000, expert: 20 * 60_000 };

const TIME_BONUS_SHARE = 0.5;
const MISTAKE_SHARE = 0.04;
const MISTAKE_CAP = 0.3;
const HINT_SHARE = 0.03;
const HINT_CAP = 0.25;

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  mistakePenalty: number;
  hintPenalty: number;
  total: number;
}

export function scoreGame(game: Pick<SessionData, "difficulty" | "completed" | "elapsedMs" | "mistakes" | "hintsUsed">): ScoreBreakdown {
  if (!game.completed) return { base: 0, timeBonus: 0, mistakePenalty: 0, hintPenalty: 0, total: 0 };
  const base = BASE_POINTS[game.difficulty];
  const remaining = Math.max(0, 1 - game.elapsedMs / (2 * PAR_MS[game.difficulty]));
  const timeBonus = Math.round(base * TIME_BONUS_SHARE * remaining);
  const mistakePenalty = Math.round(base * Math.min(MISTAKE_CAP, MISTAKE_SHARE * game.mistakes));
  const hintPenalty = Math.round(base * Math.min(HINT_CAP, HINT_SHARE * game.hintsUsed));
  return { base, timeBonus, mistakePenalty, hintPenalty, total: base + timeBonus - mistakePenalty - hintPenalty };
}

/** Highest score a puzzle of this difficulty can earn. */
export const maxScore = (difficulty: Difficulty): number => BASE_POINTS[difficulty] * (1 + TIME_BONUS_SHARE);

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
