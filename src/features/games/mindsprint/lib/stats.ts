import { DIFFICULTY_LEVELS, type DifficultyLevel } from "./config";
import { scoreSession } from "./scoring";
import { OPERATIONS, type Operation, type SessionData } from "./types";

/** Progress figures over a player's finished sessions. */

export interface Bucket {
  rounds: number;
  correct: number;
  /** Whole percent; 0 when there are no rounds. */
  accuracy: number;
  /** Mean time to answer over the answered rounds. */
  averageResponseMs: number;
}

export interface SessionSummary {
  clientId: string;
  endedAt: number;
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  accuracy: number;
}

interface MindsprintStats {
  sessions: number;
  rounds: number;
  correct: number;
  accuracy: number;
  bestScore: number;
  averageScore: number;
  averageResponseMs: number;
  byLevel: Record<DifficultyLevel, Bucket>;
  /** A round counts toward every operation it contained. */
  byOperation: Record<Operation, Bucket>;
  /** Newest first. */
  recent: SessionSummary[];
}

interface Tally {
  rounds: number;
  correct: number;
  timeTotal: number;
  timed: number;
}

const emptyTally = (): Tally => ({ rounds: 0, correct: 0, timeTotal: 0, timed: 0 });

function bucketOf(t: Tally): Bucket {
  return {
    rounds: t.rounds,
    correct: t.correct,
    accuracy: t.rounds === 0 ? 0 : Math.floor((t.correct * 100) / t.rounds),
    averageResponseMs: t.timed === 0 ? 0 : Math.round(t.timeTotal / t.timed),
  };
}

export function computeStats(sessions: readonly SessionData[], recentCount = 10): MindsprintStats {
  const levels = Object.fromEntries(DIFFICULTY_LEVELS.map((l) => [l, emptyTally()])) as Record<DifficultyLevel, Tally>;
  const operations = Object.fromEntries(OPERATIONS.map((o) => [o, emptyTally()])) as Record<Operation, Tally>;
  const all = emptyTally();
  const summaries: SessionSummary[] = [];
  let scoreTotal = 0;
  let bestScore = 0;

  for (const session of sessions) {
    const scored = scoreSession(session.rounds);
    scoreTotal += scored.score;
    bestScore = Math.max(bestScore, scored.score);
    summaries.push({
      clientId: session.clientId,
      endedAt: session.endedAt,
      score: scored.score,
      maxScore: scored.maxScore,
      correct: scored.correct,
      total: scored.total,
      accuracy: scored.accuracy,
    });

    for (const [index, round] of session.rounds.entries()) {
      const outcome = scored.rounds[index];
      const targets = [all, levels[outcome.level], ...round.config.operations.map((op) => operations[op])];
      for (const t of targets) {
        t.rounds += 1;
        if (outcome.correct) t.correct += 1;
        if (outcome.answered) {
          t.timeTotal += round.responseMs;
          t.timed += 1;
        }
      }
    }
  }

  const overall = bucketOf(all);
  return {
    sessions: sessions.length,
    rounds: overall.rounds,
    correct: overall.correct,
    accuracy: overall.accuracy,
    bestScore,
    averageScore: sessions.length === 0 ? 0 : Math.round(scoreTotal / sessions.length),
    averageResponseMs: overall.averageResponseMs,
    byLevel: Object.fromEntries(DIFFICULTY_LEVELS.map((l) => [l, bucketOf(levels[l])])) as Record<DifficultyLevel, Bucket>,
    byOperation: Object.fromEntries(OPERATIONS.map((o) => [o, bucketOf(operations[o])])) as Record<Operation, Bucket>,
    recent: summaries.sort((a, b) => b.endedAt - a.endedAt).slice(0, recentCount),
  };
}
