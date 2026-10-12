import { checkAnswer, evaluateSequence } from "./arithmetic";
import { BASE_POINTS, difficultyLevel, difficultyMultiplier, type DifficultyLevel } from "./config";
import type { PlayedRound } from "./types";

/**
 * Scoring is simple and the same everywhere:
 *
 *   a correct round earns BASE_POINTS (100) times the round's difficulty multiplier, rounded;
 *   a wrong, invalid or unanswered round earns nothing.
 *
 * Nothing about it depends on how fast the player was; speed is tracked separately as response time.
 * Every figure is derived from the played rounds (their sequence, their answer), never stored separately, so the
 * live game, the results screens, the saved history and the server cannot disagree.
 */

export interface RoundOutcome {
  /** The exact answer to the sequence that was shown. */
  correctAnswer: string;
  /** False when nothing was typed, or what was typed is not a number. */
  answered: boolean;
  correct: boolean;
  points: number;
  /** Points the round was worth if answered correctly. */
  maxPoints: number;
  multiplier: number;
  level: DifficultyLevel;
}

export const pointsFor = (multiplier: number): number => Math.round(BASE_POINTS * multiplier);

export function scoreRound(round: PlayedRound): RoundOutcome {
  const multiplier = difficultyMultiplier(round.config);
  const maxPoints = pointsFor(multiplier);
  const evaluation = evaluateSequence(round.flashes);
  const correctAnswer = evaluation.ok ? evaluation.answer : "";
  const check = evaluation.ok && round.answer !== null ? checkAnswer(round.answer, correctAnswer) : null;
  const correct = check?.status === "correct";
  return {
    correctAnswer,
    answered: check !== null && check.status !== "invalid",
    correct,
    points: correct ? maxPoints : 0,
    maxPoints,
    multiplier,
    level: difficultyLevel(round.config),
  };
}

export interface SessionScore {
  rounds: RoundOutcome[];
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  /** Whole percent of rounds answered correctly. */
  accuracy: number;
  /** Mean time to answer over the rounds that were answered; 0 if none were. */
  averageResponseMs: number;
}

export function scoreSession(rounds: readonly PlayedRound[]): SessionScore {
  const outcomes = rounds.map(scoreRound);
  const correct = outcomes.filter((o) => o.correct).length;
  const answeredTimes = rounds.filter((_, i) => outcomes[i].answered).map((r) => r.responseMs);
  return {
    rounds: outcomes,
    score: outcomes.reduce((sum, o) => sum + o.points, 0),
    maxScore: outcomes.reduce((sum, o) => sum + o.maxPoints, 0),
    correct,
    total: rounds.length,
    accuracy: rounds.length === 0 ? 0 : Math.floor((correct * 100) / rounds.length),
    averageResponseMs: answeredTimes.length === 0 ? 0 : Math.round(answeredTimes.reduce((a, b) => a + b, 0) / answeredTimes.length),
  };
}
