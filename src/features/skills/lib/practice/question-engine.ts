import { db } from "@/db";
import { questionAttempts, questionStats } from "@/db/schema";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { questionFromId } from "@/features/skills/lib/build";
import { buildPool } from "@/features/skills/lib/pools";
import type { Focus, Question } from "@/features/skills/lib/types";
import { MIN_CONCEPT_ATTEMPTS, WEAK_SCORE_THRESHOLD, selectNext, selectReview, type StatLite } from "@/features/skills/lib/practice/selection";
import { reviewQuestionIds, sessionConfig, type SessionShape } from "@/features/skills/lib/practice/sessions";

export interface EngineSession extends SessionShape {
  id: number;
  userId: number | null;
  focus: string;
  weakFocusPercent: number;
  recentWindow: number;
}

/** How many of a session's attempts are inspected to know what was asked already. */
const HISTORY_LIMIT = 500;
const WEAK_ROWS_LIMIT = 400;
const DUE_ROWS_LIMIT = 600;
const CONCEPT_ROWS_LIMIT = 300;

/**
 * Picks the next question for a session using its configuration, the session's own history and the
 * user's long-term statistics for the same skill. Selection logic itself lives in `selection.ts`.
 */
export async function getNextQuestion(session: EngineSession, excludeId?: string): Promise<Question> {
  const history = await db
    .select({ id: questionAttempts.questionId })
    .from(questionAttempts)
    .where(eq(questionAttempts.sessionId, session.id))
    .orderBy(desc(questionAttempts.createdAt))
    .limit(HISTORY_LIMIT);
  const askedIds = history.map((h) => h.id);

  if (session.mode === "review") {
    const id = selectReview(reviewQuestionIds(session), new Set(askedIds), excludeId);
    return rebuild(id);
  }

  const config = sessionConfig(session);
  if (!config) throw new Error(`Session ${session.id} has no practice configuration`);
  const pool = buildPool(config);

  // Statistics are narrowed to this skill and, where the configuration says so, to its exercise types
  // and difficulty, so one skill's history can never distort another's.
  const scope = [
    // A session's owner is always set; the explicit check keeps another user's history out regardless.
    ...(session.userId === null ? [isNull(questionStats.userId)] : [eq(questionStats.userId, session.userId)]),
    eq(questionStats.skill, config.skill),
    inArray(questionStats.exerciseType, config.exerciseTypes),
    ...("difficulty" in config ? [eq(questionStats.difficulty, config.difficulty)] : []),
    gt(questionStats.totalAttempts, 0),
  ];

  const [weakRows, dueRows, conceptRows] = await Promise.all([
    db
      .select()
      .from(questionStats)
      .where(and(...scope, gt(questionStats.weaknessScore, WEAK_SCORE_THRESHOLD)))
      .orderBy(desc(questionStats.weaknessScore))
      .limit(WEAK_ROWS_LIMIT),
    db
      .select()
      .from(questionStats)
      .where(and(...scope, or(isNull(questionStats.dueAt), lte(questionStats.dueAt, sql`NOW()`))))
      .limit(DUE_ROWS_LIMIT),
    db
      .select({
        concept: questionStats.concept,
        weakness: sql<number>`AVG(${questionStats.weaknessScore})`,
      })
      .from(questionStats)
      .where(and(...scope))
      .groupBy(questionStats.concept)
      .having(
        and(
          sql`AVG(${questionStats.weaknessScore}) > ${WEAK_SCORE_THRESHOLD}`,
          sql`SUM(${questionStats.totalAttempts}) >= ${MIN_CONCEPT_ATTEMPTS}`
        )
      )
      .limit(CONCEPT_ROWS_LIMIT),
  ]);

  const stats = new Map<string, StatLite>();
  for (const row of [...weakRows, ...dueRows]) {
    stats.set(row.questionId, { weaknessScore: row.weaknessScore, totalAttempts: row.totalAttempts, dueAt: row.dueAt });
  }
  const conceptWeakness = new Map(conceptRows.map((r) => [r.concept, Number(r.weakness)]));

  const item = selectNext({
    pool,
    stats,
    conceptWeakness,
    recentIds: session.recentWindow > 0 ? askedIds.slice(0, session.recentWindow) : [],
    seenIds: new Set(askedIds),
    excludeId,
    weakFocusPercent: session.weakFocusPercent,
    focus: session.focus as Focus,
  });
  return rebuild(item.id);
}

function rebuild(id: string): Question {
  const question = questionFromId(id);
  if (!question) throw new Error(`Stored question id is no longer valid: ${id}`);
  return question;
}
