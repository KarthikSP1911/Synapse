import { db } from "@/db";
import { practiceSessions, questionAttempts, questionStats, tableStatistics } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { applyAttempt, type ItemStats } from "@/lib/item-stats";
import type { Outcome, Question } from "@/lib/skills/types";

const SLOW_TABLE_RESPONSE_MS = 5000;

export interface AttemptRecord {
  userId: number;
  sessionId: number;
  question: Question;
  outcome: Outcome;
  hinted: boolean;
  /** The raw answer typed or chosen; null when skipped or timed out. */
  userAnswer: string | null;
  responseTimeMs: number;
  /** True when this attempt finishes the session (target reached or clock out). */
  finished: boolean;
}

async function recordQuestionStats(userId: number, question: Question, outcome: Outcome, hinted: boolean, responseTimeMs: number) {
  const now = new Date();
  const [row] = await db.select().from(questionStats).where(and(eq(questionStats.userId, userId), eq(questionStats.questionId, question.id))).limit(1);
  const next: ItemStats = applyAttempt(row ?? null, { outcome, hinted, responseTimeMs }, question.skill, now);

  // Descriptive fields are refreshed too, so a generator wording fix reaches existing rows.
  const updates = {
    concept: question.concept,
    difficulty: question.difficulty,
    prompt: question.prompt,
    ...next,
    updatedAt: now,
  };
  // Upsert so two first attempts at the same new question cannot collide on the (user, question) index.
  await db
    .insert(questionStats)
    .values({ userId, questionId: question.id, skill: question.skill, exerciseType: question.exerciseType, ...updates })
    .onConflictDoUpdate({ target: [questionStats.userId, questionStats.questionId], set: updates });
}

/** Legacy per-table roll-up for multiplication (kept as before; one row per factor). */
async function recordTable(num: number, isCorrect: boolean, responseTimeMs: number) {
  const [table] = await db.select().from(tableStatistics).where(eq(tableStatistics.number, num)).limit(1);

  if (!table) {
    await db
      .insert(tableStatistics)
      .values({
        number: num,
        totalAttempts: 1,
        correctAttempts: isCorrect ? 1 : 0,
        incorrectAttempts: isCorrect ? 0 : 1,
        accuracy: isCorrect ? 100 : 0,
        averageResponseTimeMs: responseTimeMs,
        weaknessScore: isCorrect ? 20 : 80,
        lastAttemptedAt: new Date(),
      })
      .onConflictDoNothing();
    return;
  }

  const total = table.totalAttempts + 1;
  const correct = table.correctAttempts + (isCorrect ? 1 : 0);
  const accuracy = Math.round((correct / total) * 100);
  const avgTime = Math.round((table.averageResponseTimeMs * table.totalAttempts + responseTimeMs) / total);

  await db
    .update(tableStatistics)
    .set({
      totalAttempts: total,
      correctAttempts: correct,
      incorrectAttempts: table.incorrectAttempts + (isCorrect ? 0 : 1),
      accuracy,
      averageResponseTimeMs: avgTime,
      weaknessScore: Math.max(0, Math.min(100, 100 - accuracy + (avgTime > SLOW_TABLE_RESPONSE_MS ? 10 : 0))),
      lastAttemptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tableStatistics.number, num));
}

/**
 * Stores one attempt and everything derived from it: the attempt row, the session counters, the
 * question's statistics and Leitner state, and (multiplication only) the per-table roll-up.
 * The independent writes run in parallel to keep the answer fast.
 */
export async function recordAttempt(record: AttemptRecord): Promise<void> {
  const { userId, sessionId, question, outcome, hinted, userAnswer, responseTimeMs, finished } = record;
  const isCorrect = outcome === "correct";
  const mult = question.skill === "multiplication" ? question : null;
  const asInt = (text: string | null) => (text !== null && /^\d{1,9}$/.test(text) ? Number(text) : null);

  await db.insert(questionAttempts).values({
    userId,
    sessionId,
    skill: question.skill,
    exerciseType: question.exerciseType,
    questionId: question.id,
    difficulty: question.difficulty,
    prompt: question.prompt,
    // The original multiplication columns stay filled so older queries and exports keep working.
    leftNumber: mult ? mult.left : null,
    rightNumber: mult ? mult.right : null,
    correctAnswer: mult ? mult.left * mult.right : null,
    userAnswer: mult ? asInt(userAnswer) : null,
    correctAnswerText: question.answerText,
    userAnswerText: userAnswer,
    isCorrect,
    outcome,
    hinted,
    responseTimeMs,
  });

  // Session counters are updated in SQL so concurrent requests don't lose increments.
  await Promise.all([
    db
      .update(practiceSessions)
      .set({
        actualQuestionCount: sql`${practiceSessions.actualQuestionCount} + 1`,
        totalCorrect: sql`${practiceSessions.totalCorrect} + ${isCorrect ? 1 : 0}`,
        totalIncorrect: sql`${practiceSessions.totalIncorrect} + ${isCorrect ? 0 : 1}`,
        accuracy: sql`(${practiceSessions.totalCorrect} + ${isCorrect ? 1 : 0}) * 100 / (${practiceSessions.actualQuestionCount} + 1)`,
        averageResponseTimeMs: sql`(${practiceSessions.averageResponseTimeMs} * ${practiceSessions.actualQuestionCount} + ${responseTimeMs}) / (${practiceSessions.actualQuestionCount} + 1)`,
        ...(finished ? { endedAt: new Date() } : {}),
      })
      .where(eq(practiceSessions.id, sessionId)),
    recordQuestionStats(userId, question, outcome, hinted, responseTimeMs),
    ...(mult
      ? [
          recordTable(mult.left, isCorrect, responseTimeMs),
          mult.left !== mult.right ? recordTable(mult.right, isCorrect, responseTimeMs) : Promise.resolve(),
        ]
      : []),
  ]);
}
