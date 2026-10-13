import { computePuzzleStats, type PuzzleStats } from "@/features/games/shared/lib/puzzle-stats";
import { scoreGame } from "./scoring";
import type { Difficulty, SessionData } from "./types";

export type QueensStats = PuzzleStats<SessionData>;

export const computeStats = (sessions: readonly SessionData[], unfinished: Difficulty | null = null, recentCount = 10): QueensStats =>
  computePuzzleStats(sessions, (s) => scoreGame(s).total, unfinished, recentCount);
