import { DIFFICULTIES, type Difficulty } from "./puzzle-session";

/** Progress figures over finished and abandoned puzzle games, worked out for each difficulty on its own. */

/** The part of a saved game the figures need. */
export interface PuzzleRecord {
  clientId: string;
  endedAt: number;
  difficulty: Difficulty;
  completed: boolean;
  elapsedMs: number;
  hintsUsed: number;
}

export interface DifficultyStats {
  difficulty: Difficulty;
  /** Games started and ended, plus the unfinished one in progress, if any. */
  attempted: number;
  completed: number;
  /** Whole percent of attempted games that were solved. */
  completionRate: number;
  /** Fastest solve, or null if none. */
  bestTimeMs: number | null;
  averageTimeMs: number | null;
  bestScore: number;
  /** Solved without any hint. */
  independent: number;
  hintsUsed: number;
}

export interface PuzzleStats<T extends PuzzleRecord> {
  byDifficulty: Record<Difficulty, DifficultyStats>;
  attempted: number;
  completed: number;
  completionRate: number;
  /** Total hints over all games. */
  hintsUsed: number;
  /** Newest first. */
  recent: T[];
}

export function computePuzzleStats<T extends PuzzleRecord>(sessions: readonly T[], score: (session: T) => number, unfinished: Difficulty | null = null, recentCount = 10): PuzzleStats<T> {
  const byDifficulty = {} as Record<Difficulty, DifficultyStats>;
  for (const difficulty of DIFFICULTIES) {
    const own = sessions.filter((s) => s.difficulty === difficulty);
    const solved = own.filter((s) => s.completed);
    const attempted = own.length + (unfinished === difficulty ? 1 : 0);
    const times = solved.map((s) => s.elapsedMs);
    byDifficulty[difficulty] = {
      difficulty,
      attempted,
      completed: solved.length,
      completionRate: attempted === 0 ? 0 : Math.floor((solved.length * 100) / attempted),
      bestTimeMs: times.length === 0 ? null : Math.min(...times),
      averageTimeMs: times.length === 0 ? null : Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      bestScore: solved.reduce((best, s) => Math.max(best, score(s)), 0),
      independent: solved.filter((s) => s.hintsUsed === 0).length,
      hintsUsed: own.reduce((n, s) => n + s.hintsUsed, 0),
    };
  }
  const attempted = sessions.length + (unfinished ? 1 : 0);
  const completed = sessions.filter((s) => s.completed).length;
  return {
    byDifficulty,
    attempted,
    completed,
    completionRate: attempted === 0 ? 0 : Math.floor((completed * 100) / attempted),
    hintsUsed: sessions.reduce((n, s) => n + s.hintsUsed, 0),
    recent: [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, recentCount),
  };
}
