import { scorePuzzle, type Difficulty, type ScoreBreakdown } from "@/features/games/shared/lib/puzzle-session";
import type { SessionData } from "./types";

/** Points for a solved Queens puzzle; the formula is in `scorePuzzle`. A puzzle that was not solved scores nothing. */

export const BASE_POINTS: Record<Difficulty, number> = { easy: 400, medium: 800, hard: 1400, expert: 2200 };
/** A comfortable solving time for each difficulty. */
export const PAR_MS: Record<Difficulty, number> = { easy: 2 * 60_000, medium: 4 * 60_000, hard: 7 * 60_000, expert: 12 * 60_000 };

export const scoreGame = (game: Pick<SessionData, "difficulty" | "completed" | "elapsedMs" | "hintsUsed">): ScoreBreakdown =>
  scorePuzzle({ base: BASE_POINTS[game.difficulty], parMs: PAR_MS[game.difficulty], completed: game.completed, elapsedMs: game.elapsedMs, hintsUsed: game.hintsUsed });
