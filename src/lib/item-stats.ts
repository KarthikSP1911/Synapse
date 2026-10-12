import type { Outcome, Skill } from "@/lib/skills/types";
import { NEW_ITEM_BOX, dueDateForBox, nextBoxForAttempt } from "@/lib/spaced-repetition";

/**
 * Per-item performance (an item is one stable question id) and how one attempt changes it.
 * Pure, so it is shared by every skill and testable without a database.
 */
export interface ItemStats {
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  hintedAttempts: number;
  /** Percentage 0-100, rounded. */
  accuracy: number;
  averageResponseTimeMs: number;
  fastestResponseTimeMs: number | null;
  slowestResponseTimeMs: number | null;
  currentCorrectStreak: number;
  currentIncorrectStreak: number;
  bestCorrectStreak: number;
  /** 0-100; higher means the item needs more work. */
  weaknessScore: number;
  box: number;
  dueAt: Date | null;
  lastAttemptedAt: Date | null;
}

export interface AttemptInput {
  outcome: Outcome;
  hinted: boolean;
  responseTimeMs: number;
}

/**
 * Average response above which an item counts as slow. Multiplication keeps its original 5 s;
 * the other skills involve several mental steps, so they get proportionally more time.
 */
export const SLOW_RESPONSE_MS: Record<Skill, number> = {
  multiplication: 5000,
  addition: 5000,
  subtraction: 6000,
  division: 8000,
  square: 8000,
  percentage: 10000,
  fraction: 12000,
  exponents: 10000,
};

const clampScore = (score: number) => Math.max(0, Math.min(100, score));

export function applyAttempt(prev: ItemStats | null, attempt: AttemptInput, skill: Skill, now: Date): ItemStats {
  const correct = attempt.outcome === "correct";
  const unassisted = correct && !attempt.hinted;
  const time = attempt.responseTimeMs;
  const box = nextBoxForAttempt(prev?.box ?? NEW_ITEM_BOX, attempt);

  if (!prev) {
    return {
      totalAttempts: 1,
      correctAttempts: correct ? 1 : 0,
      incorrectAttempts: correct ? 0 : 1,
      hintedAttempts: attempt.hinted ? 1 : 0,
      accuracy: correct ? 100 : 0,
      averageResponseTimeMs: time,
      fastestResponseTimeMs: time,
      slowestResponseTimeMs: time,
      currentCorrectStreak: unassisted ? 1 : 0,
      currentIncorrectStreak: correct ? 0 : 1,
      bestCorrectStreak: unassisted ? 1 : 0,
      weaknessScore: unassisted ? 20 : correct ? 50 : 80,
      box,
      dueAt: dueDateForBox(box, now),
      lastAttemptedAt: now,
    };
  }

  const total = prev.totalAttempts + 1;
  const correctCount = prev.correctAttempts + (correct ? 1 : 0);
  const accuracy = Math.round((correctCount / total) * 100);
  const correctStreak = unassisted ? prev.currentCorrectStreak + 1 : correct ? prev.currentCorrectStreak : 0;
  const incorrectStreak = correct ? 0 : prev.currentIncorrectStreak + 1;
  const avgTime = Math.round((prev.averageResponseTimeMs * prev.totalAttempts + time) / total);

  // Weakness (0-100): error rate, penalised for slowness, error streaks and leaning on hints.
  let weakness = 100 - accuracy;
  if (avgTime > SLOW_RESPONSE_MS[skill]) weakness += 10;
  if (incorrectStreak > 1) weakness += 10 * (incorrectStreak - 1);
  if (correctStreak > 3) weakness -= 20;
  if (correct && attempt.hinted) weakness += 10;

  return {
    totalAttempts: total,
    correctAttempts: correctCount,
    incorrectAttempts: prev.incorrectAttempts + (correct ? 0 : 1),
    hintedAttempts: prev.hintedAttempts + (attempt.hinted ? 1 : 0),
    accuracy,
    averageResponseTimeMs: avgTime,
    fastestResponseTimeMs: Math.min(prev.fastestResponseTimeMs ?? time, time),
    slowestResponseTimeMs: Math.max(prev.slowestResponseTimeMs ?? time, time),
    currentCorrectStreak: correctStreak,
    currentIncorrectStreak: incorrectStreak,
    bestCorrectStreak: Math.max(prev.bestCorrectStreak, correctStreak),
    weaknessScore: clampScore(weakness),
    box,
    dueAt: dueDateForBox(box, now),
    lastAttemptedAt: now,
  };
}
