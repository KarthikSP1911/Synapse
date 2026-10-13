import { db } from "@/db";
import { questionAttempts } from "@/db/schema";
import { and, desc, eq, gte, max } from "drizzle-orm";
import { questionFromId } from "@/features/skills/lib/build";
import { MAX_REVIEW_DAYS, MAX_REVIEW_QUESTIONS, type ReviewRequest } from "@/features/skills/lib/practice/sessions";
import type { Skill } from "@/features/skills/lib/types";

export { MAX_REVIEW_DAYS, MAX_REVIEW_QUESTIONS };

export interface MistakeScope {
  userId: number;
  sessionId?: number;
  sinceDays?: number;
  skill?: Skill;
  exerciseType?: string;
}

/**
 * Distinct questions answered incorrectly (wrong, skipped or timed out), most recent mistake first,
 * capped at MAX_REVIEW_QUESTIONS. Scope with a session, a look-back window in days, a skill and an
 * exercise type, in any combination. Original attempts are never modified: retrying a mistake
 * creates a new session with its own attempts.
 */
export async function getMistakeQuestionIds(scope: MistakeScope | (ReviewRequest & { userId: number })): Promise<string[]> {
  const conditions = [eq(questionAttempts.userId, scope.userId), eq(questionAttempts.isCorrect, false)];
  if (scope.sessionId !== undefined) conditions.push(eq(questionAttempts.sessionId, scope.sessionId));
  if (scope.sinceDays !== undefined) {
    conditions.push(gte(questionAttempts.createdAt, new Date(Date.now() - scope.sinceDays * 24 * 60 * 60 * 1000)));
  }
  if (scope.skill) conditions.push(eq(questionAttempts.skill, scope.skill));
  if (scope.exerciseType) conditions.push(eq(questionAttempts.exerciseType, scope.exerciseType));

  const lastMissed = max(questionAttempts.createdAt);
  const rows = await db
    .select({ id: questionAttempts.questionId })
    .from(questionAttempts)
    .where(and(...conditions))
    .groupBy(questionAttempts.questionId)
    .orderBy(desc(lastMissed))
    .limit(MAX_REVIEW_QUESTIONS);

  // Drop ids the generators no longer recognise, so a review session can never contain a broken question.
  return rows.map((r) => r.id).filter((id) => questionFromId(id) !== null);
}
