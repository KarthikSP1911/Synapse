import { scoreSession } from "./scoring";
import { RECALL_MODES, type RecallMode, type SessionData } from "./types";

/**
 * Progress figures over finished sessions. They are always worked out for ONE mode: single-digit and
 * two-digit recall are different skills, so their sessions are never mixed.
 */

interface LengthBucket {
  length: number;
  rounds: number;
  perfect: number;
  /** Whole percent of rounds of this length recalled perfectly. */
  accuracy: number;
  /** Whole percent of items recalled in the right place. */
  positionAccuracy: number;
}

export interface SessionSummary {
  clientId: string;
  endedAt: number;
  score: number;
  maxScore: number;
  perfect: number;
  total: number;
  longest: number;
}

interface RecallStats {
  mode: RecallMode;
  sessions: number;
  rounds: number;
  perfect: number;
  accuracy: number;
  positionAccuracy: number;
  bestScore: number;
  averageScore: number;
  /** Items in the longest sequence ever recalled perfectly; 0 if none. */
  longestRecalled: number;
  averageResponseMs: number;
  /** Shortest length first. */
  byLength: LengthBucket[];
  /** Newest first. */
  recent: SessionSummary[];
}

export function computeStats(sessions: readonly SessionData[], mode: RecallMode, recentCount = 10): RecallStats {
  const own = sessions.filter((s) => s.config.mode === mode);
  const lengths = new Map<number, { rounds: number; perfect: number; items: number; correctItems: number }>();
  const summaries: SessionSummary[] = [];
  let rounds = 0;
  let perfect = 0;
  let items = 0;
  let correctItems = 0;
  let scoreTotal = 0;
  let bestScore = 0;
  let longestRecalled = 0;
  let timeTotal = 0;
  let timed = 0;

  for (const session of own) {
    const scored = scoreSession(session.config, session.rounds);
    scoreTotal += scored.score;
    bestScore = Math.max(bestScore, scored.score);
    longestRecalled = Math.max(longestRecalled, scored.longestRecalled);
    summaries.push({ clientId: session.clientId, endedAt: session.endedAt, score: scored.score, maxScore: scored.maxScore, perfect: scored.perfect, total: scored.total, longest: scored.longestRecalled });

    for (const [index, round] of session.rounds.entries()) {
      const s = scored.rounds[index];
      const bucket = lengths.get(s.total) ?? { rounds: 0, perfect: 0, items: 0, correctItems: 0 };
      bucket.rounds += 1;
      bucket.items += s.total;
      bucket.correctItems += s.correct;
      if (s.perfect) bucket.perfect += 1;
      lengths.set(s.total, bucket);
      rounds += 1;
      items += s.total;
      correctItems += s.correct;
      if (s.perfect) perfect += 1;
      if (round.answer !== null) {
        timeTotal += round.responseMs;
        timed += 1;
      }
    }
  }

  return {
    mode,
    sessions: own.length,
    rounds,
    perfect,
    accuracy: rounds === 0 ? 0 : Math.floor((perfect * 100) / rounds),
    positionAccuracy: items === 0 ? 0 : Math.floor((correctItems * 100) / items),
    bestScore,
    averageScore: own.length === 0 ? 0 : Math.round(scoreTotal / own.length),
    longestRecalled,
    averageResponseMs: timed === 0 ? 0 : Math.round(timeTotal / timed),
    byLength: [...lengths.entries()]
      .sort(([a], [b]) => a - b)
      .map(([length, b]) => ({
        length,
        rounds: b.rounds,
        perfect: b.perfect,
        accuracy: Math.floor((b.perfect * 100) / b.rounds),
        positionAccuracy: Math.floor((b.correctItems * 100) / b.items),
      })),
    recent: summaries.sort((a, b) => b.endedAt - a.endedAt).slice(0, recentCount),
  };
}

/** Both modes at once, for screens that show them side by side. Each is computed on its own sessions only. */
export const computeAllStats = (sessions: readonly SessionData[]): Record<RecallMode, RecallStats> =>
  Object.fromEntries(RECALL_MODES.map((mode) => [mode, computeStats(sessions, mode)])) as Record<RecallMode, RecallStats>;
