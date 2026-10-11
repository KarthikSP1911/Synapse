import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { practiceSessions, questionAttempts, questionStats } from "@/db/schema";
import { applyAttempt, type ItemStats } from "@/lib/item-stats";
import type { ValidAttempt, ValidSession } from "@/lib/sync/payload";

export interface SyncedSession {
  clientId: string;
  /** The server's id for the session. */
  id: number;
  /** Attempts newly stored by this call (0 when the session was already up to date). */
  stored: number;
}

const asInt = (text: string | null) => (text !== null && /^\d{1,9}$/.test(text) ? Number(text) : null);

async function findSessionId(userId: number, clientId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.clientId, clientId)))
    .limit(1);
  return row?.id;
}

/**
 * Stores one uploaded session and everything derived from it. Safe to repeat: the session is found by
 * (user, clientId), and an attempt already stored (same session and time) is skipped, so a retried or
 * partly-failed upload only adds what is missing and never counts an answer twice.
 */
export async function storeSyncedSession(userId: number, session: ValidSession): Promise<SyncedSession> {
  const { clientId, fields, attempts } = session;

  let sessionId = await findSessionId(userId, clientId);
  if (sessionId === undefined) {
    const [created] = await db
      .insert(practiceSessions)
      .values({
        userId,
        clientId,
        skill: fields.skill,
        mode: fields.mode,
        focus: fields.focus,
        config: fields.config,
        targetQuestionCount: fields.targetQuestionCount,
        durationSeconds: fields.durationSeconds,
        questionTimeLimitSeconds: fields.questionTimeLimitSeconds,
        weakFocusPercent: fields.weakFocusPercent,
        recentWindow: fields.recentWindow,
        questionList: fields.questionList,
        selectedLeftNumbers: fields.selectedLeftNumbers,
        selectedRightNumbers: fields.selectedRightNumbers,
        startedAt: new Date(session.startedAt),
        pausedMs: session.pausedMs,
      })
      // Two uploads of the same session racing each other: the loser reads the winner's row instead.
      .onConflictDoNothing()
      .returning({ id: practiceSessions.id });
    sessionId = created?.id ?? (await findSessionId(userId, clientId));
    if (sessionId === undefined) throw new Error("Could not create or find the session");
  }
  const id = sessionId;

  // Attempts already stored for this session, by time. This is what makes a re-upload add only the new ones.
  const storedRows = await db.select({ at: questionAttempts.createdAt }).from(questionAttempts).where(eq(questionAttempts.sessionId, id));
  const have = new Set(storedRows.map((r) => r.at.getTime()));
  const fresh = attempts.filter((a) => !have.has(a.at));

  if (fresh.length > 0) {
    await db.insert(questionAttempts).values(
      fresh.map((a) => {
        const q = a.question;
        const mult = q.skill === "multiplication" ? q : null;
        return {
          userId,
          sessionId: id,
          skill: q.skill,
          exerciseType: q.exerciseType,
          questionId: q.id,
          difficulty: q.difficulty,
          prompt: q.prompt,
          // The original multiplication columns stay filled so older queries and exports keep working.
          leftNumber: mult ? mult.left : null,
          rightNumber: mult ? mult.right : null,
          correctAnswer: mult ? mult.left * mult.right : null,
          userAnswer: mult ? asInt(a.userAnswer) : null,
          correctAnswerText: q.answerText,
          userAnswerText: a.userAnswer,
          isCorrect: a.outcome === "correct",
          outcome: a.outcome,
          hinted: a.hinted,
          responseTimeMs: a.responseTimeMs,
          createdAt: new Date(a.at),
        };
      })
    );
    await updateQuestionStats(userId, fresh);
  }

  // The session's running figures are recomputed from its attempts, so they are right however the upload was split.
  const [totals] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      correct: sql<number>`COUNT(*) FILTER (WHERE ${questionAttempts.isCorrect})::int`,
      avg: sql<number>`COALESCE(FLOOR(AVG(${questionAttempts.responseTimeMs})), 0)::int`,
    })
    .from(questionAttempts)
    .where(eq(questionAttempts.sessionId, id));
  await db
    .update(practiceSessions)
    .set({
      actualQuestionCount: totals.count,
      totalCorrect: totals.correct,
      totalIncorrect: totals.count - totals.correct,
      accuracy: totals.count === 0 ? 0 : Math.floor((totals.correct * 100) / totals.count),
      averageResponseTimeMs: totals.avg,
      pausedMs: session.pausedMs,
      endedAt: session.endedAt === null ? null : new Date(session.endedAt),
    })
    .where(eq(practiceSessions.id, id));

  return { clientId, id, stored: fresh.length };
}

/**
 * Applies new attempts (oldest first) to the user's per-question statistics and review schedule. The
 * statistics are advanced in memory in the order the answers happened, then written once per question.
 */
async function updateQuestionStats(userId: number, fresh: ValidAttempt[]): Promise<void> {
  const ids = [...new Set(fresh.map((a) => a.question.id))];
  const rows = await db.select().from(questionStats).where(and(eq(questionStats.userId, userId), inArray(questionStats.questionId, ids)));
  const current = new Map<string, ItemStats | null>(rows.map((r) => [r.questionId, r]));
  const last = new Map<string, { stats: ItemStats; attempt: ValidAttempt }>();

  for (const a of fresh) {
    const next = applyAttempt(
      current.get(a.question.id) ?? null,
      { outcome: a.outcome, hinted: a.hinted, responseTimeMs: a.responseTimeMs },
      a.question.skill,
      new Date(a.at)
    );
    current.set(a.question.id, next);
    last.set(a.question.id, { stats: next, attempt: a });
  }

  await Promise.all(
    [...last.values()].map(({ stats, attempt }) => {
      const q = attempt.question;
      // Descriptive fields are refreshed too, so a generator wording fix reaches existing rows.
      const updates = { concept: q.concept, difficulty: q.difficulty, prompt: q.prompt, ...stats, updatedAt: new Date(attempt.at) };
      return db
        .insert(questionStats)
        .values({ userId, questionId: q.id, skill: q.skill, exerciseType: q.exerciseType, ...updates })
        .onConflictDoUpdate({ target: [questionStats.userId, questionStats.questionId], set: updates });
    })
  );
}
