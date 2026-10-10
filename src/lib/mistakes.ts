import { db } from "@/db";
import { questionAttempts } from "@/db/schema";
import { and, desc, eq, gte, max } from "drizzle-orm";
import type { Question } from "@/lib/question-engine";

export const MAX_REVIEW_PAIRS = 50;
export const MAX_REVIEW_DAYS = 30;

/**
 * Distinct pairs answered incorrectly, most recent mistake first, capped at
 * MAX_REVIEW_PAIRS. Scope with a session id, a look-back window in days, or both.
 */
export async function getMistakePairs(scope: { sessionId?: number; sinceDays?: number }): Promise<Question[]> {
  const conditions = [eq(questionAttempts.isCorrect, false)];
  if (scope.sessionId !== undefined) conditions.push(eq(questionAttempts.sessionId, scope.sessionId));
  if (scope.sinceDays !== undefined) {
    conditions.push(gte(questionAttempts.createdAt, new Date(Date.now() - scope.sinceDays * 24 * 60 * 60 * 1000)));
  }

  const lastMissed = max(questionAttempts.createdAt);
  const rows = await db
    .select({ left: questionAttempts.leftNumber, right: questionAttempts.rightNumber })
    .from(questionAttempts)
    .where(and(...conditions))
    .groupBy(questionAttempts.leftNumber, questionAttempts.rightNumber)
    .orderBy(desc(lastMissed))
    .limit(MAX_REVIEW_PAIRS);

  return rows;
}
