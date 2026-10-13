import { scoreGame } from "./scoring";
import { DIFFICULTIES, type Difficulty, type SessionData } from "./types";

/** Progress figures over finished and abandoned games, worked out for each difficulty on its own. */

interface DifficultyStats {
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
  mistakes: number;
  hintsUsed: number;
}

export interface SudokuStats {
  byDifficulty: Record<Difficulty, DifficultyStats>;
  attempted: number;
  completed: number;
  completionRate: number;
  /** Newest first. */
  recent: SessionData[];
}

export function computeStats(sessions: readonly SessionData[], unfinished: Difficulty | null = null, recentCount = 10): SudokuStats {
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
      bestScore: solved.reduce((best, s) => Math.max(best, scoreGame(s).total), 0),
      independent: solved.filter((s) => s.hintsUsed === 0).length,
      mistakes: own.reduce((n, s) => n + s.mistakes, 0),
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
    recent: [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, recentCount),
  };
}
