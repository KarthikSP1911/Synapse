import { compareSequences } from "./answer";
import type { PlayedRound, RecallConfig, RecallMode } from "./types";

/**
 * Scoring:
 *
 *   - each item recalled in the right place is worth POSITION_POINTS (10 for a digit, 20 for a pair);
 *   - a perfect recall (every item, right order) is worth double its positions;
 *   - with partial credit on, a round that is not perfect still earns one POSITION_POINTS per correct position,
 *     so it always scores less than a perfect round; with it off, it scores nothing;
 *   - all of it is scaled by how fast the items flash: quicker is harder, so worth more.
 *
 * Everything is derived from the sequence, the answer and the settings, never stored, so the live game, the
 * results, the saved history and the server cannot disagree.
 */

export const POSITION_POINTS: Record<RecallMode, number> = { single: 10, pair: 20 };
export const PERFECT_BONUS = 2;

/** Faster flashing is harder to hold, so it pays more. */
export function speedMultiplier(displayMs: number): number {
  if (displayMs <= 500) return 1.5;
  if (displayMs <= 800) return 1.25;
  if (displayMs <= 1200) return 1;
  return 0.75;
}

export interface RoundScore {
  positions: boolean[];
  correct: number;
  total: number;
  perfect: boolean;
  points: number;
  /** What the round was worth for a perfect recall. */
  maxPoints: number;
}

export function scoreRound(config: Pick<RecallConfig, "mode" | "displayMs" | "partialCredit">, round: PlayedRound): RoundScore {
  const comparison = compareSequences(round.sequence, round.answer);
  const perItem = POSITION_POINTS[config.mode] * speedMultiplier(config.displayMs);
  const maxPoints = Math.round(comparison.total * perItem * PERFECT_BONUS);
  const points = comparison.perfect ? maxPoints : config.partialCredit ? Math.round(comparison.correct * perItem) : 0;
  return { ...comparison, points, maxPoints };
}

export interface SessionScore {
  rounds: RoundScore[];
  score: number;
  maxScore: number;
  /** Rounds recalled perfectly. */
  perfect: number;
  total: number;
  /** Whole percent of rounds recalled perfectly. */
  accuracy: number;
  /** Whole percent of all items recalled in the right place. */
  positionAccuracy: number;
  /** Items in the longest sequence recalled perfectly; 0 if none was. */
  longestRecalled: number;
  /** Mean time to enter an answer over the rounds that were answered. */
  averageResponseMs: number;
}

export function scoreSession(config: Pick<RecallConfig, "mode" | "displayMs" | "partialCredit">, rounds: readonly PlayedRound[]): SessionScore {
  const scored = rounds.map((r) => scoreRound(config, r));
  const perfect = scored.filter((s) => s.perfect).length;
  const items = scored.reduce((sum, s) => sum + s.total, 0);
  const correctItems = scored.reduce((sum, s) => sum + s.correct, 0);
  const answeredTimes = rounds.filter((r) => r.answer !== null).map((r) => r.responseMs);
  return {
    rounds: scored,
    score: scored.reduce((sum, s) => sum + s.points, 0),
    maxScore: scored.reduce((sum, s) => sum + s.maxPoints, 0),
    perfect,
    total: rounds.length,
    accuracy: rounds.length === 0 ? 0 : Math.floor((perfect * 100) / rounds.length),
    positionAccuracy: items === 0 ? 0 : Math.floor((correctItems * 100) / items),
    longestRecalled: scored.reduce((best, s) => (s.perfect ? Math.max(best, s.total) : best), 0),
    averageResponseMs: answeredTimes.length === 0 ? 0 : Math.round(answeredTimes.reduce((a, b) => a + b, 0) / answeredTimes.length),
  };
}
