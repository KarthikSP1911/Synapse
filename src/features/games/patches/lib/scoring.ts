import { scorePuzzle, type Difficulty, type ScoreBreakdown } from "@/features/games/shared/lib/puzzle-session";
import type { SessionData } from "./types";

/** Points for a solved Patches puzzle; the formula is in `scorePuzzle`. A puzzle that was not solved scores nothing. */

export const BASE_POINTS: Record<Difficulty, number> = { easy: 300, medium: 700, hard: 1200, expert: 1900 };
/** A comfortable solving time for each difficulty. */
export const PAR_MS: Record<Difficulty, number> = { easy: 75_000, medium: 150_000, hard: 4 * 60_000, expert: 7 * 60_000 };

export const scoreGame = (game: Pick<SessionData, "difficulty" | "completed" | "elapsedMs" | "hintsUsed">): ScoreBreakdown =>
  scorePuzzle({ base: BASE_POINTS[game.difficulty], parMs: PAR_MS[game.difficulty], completed: game.completed, elapsedMs: game.elapsedMs, hintsUsed: game.hintsUsed });
