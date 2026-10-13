import { db } from "@/db";
import { practiceSessions, questionAttempts, questionStats } from "@/db/schema";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { SKILLS, type Skill } from "@/features/skills/lib/types";
import { MASTERED_MAX_WEAKNESS, MASTERED_MIN_ATTEMPTS, WEAK_MIN_WEAKNESS, overviewOf } from "@/features/progress/lib/progress-shared";

/**
 * Read-side queries for the home, progress, tables and profile pages. Every figure comes from the
 * database and is scoped to one user: each function takes the signed-in user's id first.
 */

export type SkillFilter = Skill | "all";

export function parseSkillFilter(value: unknown): SkillFilter {
  return SKILLS.includes(value as Skill) ? (value as Skill) : "all";
}

export { MASTERED_MAX_WEAKNESS, MASTERED_MIN_ATTEMPTS, WEAK_MIN_WEAKNESS, overviewOf };

const isDueSql = sql`(${questionStats.dueAt} IS NULL OR ${questionStats.dueAt} <= NOW())`;
const attempted = gt(questionStats.totalAttempts, 0);
/** One user's statistics, optionally narrowed to a skill. */
const scoped = (userId: number, filter: SkillFilter = "all") =>
  and(eq(questionStats.userId, userId), filter === "all" ? undefined : eq(questionStats.skill, filter));

// ---------------------------------------------------------------------------
// Per-skill summaries (home page cards, progress overview)
// ---------------------------------------------------------------------------

export interface SkillSummary {
  skill: Skill;
  attempts: number;
  correct: number;
  /** 0-100, weighted by attempts; 0 when nothing has been answered. */
  accuracy: number;
  averageResponseTimeMs: number;
  /** Items whose review date has passed. */
  due: number;
  /** Items answered at least 5 times with a weakness score of 30 or less. */
  mastered: number;
  /** Items currently scoring above the weak threshold. */
  weak: number;
}

/** One summary per skill, including skills with no history yet. */
export async function getSkillSummaries(userId: number): Promise<Record<Skill, SkillSummary>> {
  const rows = await db
    .select({
      skill: questionStats.skill,
      attempts: sql<string>`COALESCE(SUM(${questionStats.totalAttempts}), 0)`,
      correct: sql<string>`COALESCE(SUM(${questionStats.correctAttempts}), 0)`,
      // Weighted by attempts so rarely-seen questions don't skew the average.
      avgTime: sql<string>`COALESCE(SUM(${questionStats.averageResponseTimeMs} * ${questionStats.totalAttempts}) / NULLIF(SUM(${questionStats.totalAttempts}), 0), 0)`,
      due: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.totalAttempts} > 0 AND ${isDueSql})`,
      mastered: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.totalAttempts} >= ${MASTERED_MIN_ATTEMPTS} AND ${questionStats.weaknessScore} <= ${MASTERED_MAX_WEAKNESS})`,
      weak: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.totalAttempts} > 0 AND ${questionStats.weaknessScore} > ${WEAK_MIN_WEAKNESS})`,
    })
    .from(questionStats)
    .where(eq(questionStats.userId, userId))
    .groupBy(questionStats.skill);

  const summaries = {} as Record<Skill, SkillSummary>;
  for (const skill of SKILLS) {
    const row = rows.find((r) => r.skill === skill);
    const attempts = Number(row?.attempts ?? 0);
    const correct = Number(row?.correct ?? 0);
    summaries[skill] = {
      skill,
      attempts,
      correct,
      accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
      averageResponseTimeMs: Math.round(Number(row?.avgTime ?? 0)),
      due: Number(row?.due ?? 0),
      mastered: Number(row?.mastered ?? 0),
      weak: Number(row?.weak ?? 0),
    };
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// Performance by exercise type
// ---------------------------------------------------------------------------

export interface ExerciseBreakdown {
  skill: Skill;
  exerciseType: string;
  attempts: number;
  accuracy: number;
  averageResponseTimeMs: number;
  /** Distinct questions practised. */
  items: number;
  weak: number;
}

export async function getExerciseBreakdown(userId: number, filter: SkillFilter): Promise<ExerciseBreakdown[]> {
  const rows = await db
    .select({
      skill: questionStats.skill,
      exerciseType: questionStats.exerciseType,
      attempts: sql<string>`SUM(${questionStats.totalAttempts})`,
      correct: sql<string>`SUM(${questionStats.correctAttempts})`,
      avgTime: sql<string>`COALESCE(SUM(${questionStats.averageResponseTimeMs} * ${questionStats.totalAttempts}) / NULLIF(SUM(${questionStats.totalAttempts}), 0), 0)`,
      items: sql<string>`COUNT(*)`,
      weak: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.weaknessScore} > ${WEAK_MIN_WEAKNESS})`,
    })
    .from(questionStats)
    .where(and(attempted, scoped(userId, filter)))
    .groupBy(questionStats.skill, questionStats.exerciseType)
    .orderBy(asc(questionStats.skill), asc(questionStats.exerciseType));

  return rows.map((r) => {
    const attempts = Number(r.attempts);
    return {
      skill: r.skill as Skill,
      exerciseType: r.exerciseType,
      attempts,
      accuracy: attempts > 0 ? Math.round((Number(r.correct) / attempts) * 100) : 0,
      averageResponseTimeMs: Math.round(Number(r.avgTime)),
      items: Number(r.items),
      weak: Number(r.weak),
    };
  });
}

// ---------------------------------------------------------------------------
// Weak and mastered items and concepts
// ---------------------------------------------------------------------------

export interface ItemRow {
  questionId: string;
  skill: Skill;
  exerciseType: string;
  prompt: string;
  attempts: number;
  accuracy: number;
  averageResponseTimeMs: number;
  weaknessScore: number;
  box: number;
}

const itemColumns = {
  questionId: questionStats.questionId,
  skill: questionStats.skill,
  exerciseType: questionStats.exerciseType,
  prompt: questionStats.prompt,
  attempts: questionStats.totalAttempts,
  accuracy: questionStats.accuracy,
  averageResponseTimeMs: questionStats.averageResponseTimeMs,
  weaknessScore: questionStats.weaknessScore,
  box: questionStats.box,
};

export async function getWeakItems(userId: number, filter: SkillFilter, limit = 10): Promise<ItemRow[]> {
  const rows = await db
    .select(itemColumns)
    .from(questionStats)
    .where(and(attempted, scoped(userId, filter)))
    .orderBy(desc(questionStats.weaknessScore), desc(questionStats.totalAttempts))
    .limit(limit);
  return rows as ItemRow[];
}

export async function getMasteredItems(userId: number, filter: SkillFilter, limit = 5): Promise<ItemRow[]> {
  const rows = await db
    .select(itemColumns)
    .from(questionStats)
    .where(and(gt(questionStats.totalAttempts, MASTERED_MIN_ATTEMPTS - 1), scoped(userId, filter)))
    .orderBy(asc(questionStats.weaknessScore), desc(questionStats.totalAttempts))
    .limit(limit);
  return rows as ItemRow[];
}

export interface ConceptRow {
  concept: string;
  skill: Skill;
  items: number;
  attempts: number;
  accuracy: number;
  weaknessScore: number;
}

/**
 * Concepts (a percentage, a fraction, a square) ranked by how weak their questions are on average.
 * Multiplication concepts are single pairs, so they would only repeat the weak-question list.
 */
export async function getWeakConcepts(userId: number, filter: SkillFilter, limit = 8): Promise<ConceptRow[]> {
  const rows = await db
    .select({
      concept: questionStats.concept,
      skill: sql<string>`MIN(${questionStats.skill})`,
      items: sql<string>`COUNT(*)`,
      attempts: sql<string>`SUM(${questionStats.totalAttempts})`,
      correct: sql<string>`SUM(${questionStats.correctAttempts})`,
      weakness: sql<string>`AVG(${questionStats.weaknessScore})`,
    })
    .from(questionStats)
    .where(and(attempted, scoped(userId, filter), sql`${questionStats.skill} <> 'multiplication'`))
    .groupBy(questionStats.concept)
    .having(sql`SUM(${questionStats.totalAttempts}) >= 2`)
    .orderBy(desc(sql`AVG(${questionStats.weaknessScore})`), desc(sql`SUM(${questionStats.totalAttempts})`))
    .limit(limit);

  return rows.map((r) => {
    const attempts = Number(r.attempts);
    return {
      concept: r.concept,
      skill: r.skill as Skill,
      items: Number(r.items),
      attempts,
      accuracy: Math.round((Number(r.correct) / attempts) * 100),
      weaknessScore: Math.round(Number(r.weakness)),
    };
  });
}

// ---------------------------------------------------------------------------
// Spaced repetition
// ---------------------------------------------------------------------------

export interface UpcomingReviews {
  dueNow: number;
  /** Items becoming due, bucketed by how far away their review date is. */
  upcoming: { label: string; count: number }[];
  /** Number of practised items in each Leitner box, index 0 = box 1. */
  boxes: number[];
}

export async function getUpcomingReviews(userId: number, filter: SkillFilter): Promise<UpcomingReviews> {
  const [row] = await db
    .select({
      dueNow: sql<string>`COUNT(*) FILTER (WHERE ${isDueSql})`,
      d1: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.dueAt} > NOW() AND ${questionStats.dueAt} <= NOW() + INTERVAL '1 day')`,
      d3: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.dueAt} > NOW() + INTERVAL '1 day' AND ${questionStats.dueAt} <= NOW() + INTERVAL '3 days')`,
      d7: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.dueAt} > NOW() + INTERVAL '3 days' AND ${questionStats.dueAt} <= NOW() + INTERVAL '7 days')`,
      later: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.dueAt} > NOW() + INTERVAL '7 days')`,
      b1: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.box} = 1)`,
      b2: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.box} = 2)`,
      b3: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.box} = 3)`,
      b4: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.box} = 4)`,
      b5: sql<string>`COUNT(*) FILTER (WHERE ${questionStats.box} = 5)`,
    })
    .from(questionStats)
    .where(and(attempted, scoped(userId, filter)));

  return {
    dueNow: Number(row.dueNow),
    upcoming: [
      { label: "Within a day", count: Number(row.d1) },
      { label: "In 1–3 days", count: Number(row.d3) },
      { label: "In 3–7 days", count: Number(row.d7) },
      { label: "Later", count: Number(row.later) },
    ],
    boxes: [row.b1, row.b2, row.b3, row.b4, row.b5].map(Number),
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Sessions with at least one answer, newest first. */
export async function getRecentSessions(userId: number, filter: SkillFilter, limit: number) {
  return db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), gt(practiceSessions.actualQuestionCount, 0), filter === "all" ? undefined : eq(practiceSessions.skill, filter)))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Heatmaps
// ---------------------------------------------------------------------------

export interface MatrixCell {
  left: number;
  right: number;
  attempts: number;
  accuracy: number;
  averageResponseTimeMs: number;
  weaknessScore: number;
}

/** Every multiplication pair that has been attempted, for the 20×20 heatmap. */
export async function getMultiplicationCells(userId: number): Promise<MatrixCell[]> {
  const rows = await db
    .select({
      questionId: questionStats.questionId,
      attempts: questionStats.totalAttempts,
      accuracy: questionStats.accuracy,
      averageResponseTimeMs: questionStats.averageResponseTimeMs,
      weaknessScore: questionStats.weaknessScore,
    })
    .from(questionStats)
    .where(and(eq(questionStats.userId, userId), eq(questionStats.skill, "multiplication"), attempted));

  const cells: MatrixCell[] = [];
  for (const row of rows) {
    const [, left, right] = row.questionId.split(":");
    if (Number.isInteger(Number(left)) && Number.isInteger(Number(right))) {
      cells.push({ left: Number(left), right: Number(right), ...row });
    }
  }
  return cells;
}

export interface SquareCell {
  n: number;
  attempts: number;
  correct: number;
  accuracy: number;
  averageResponseTimeMs: number;
  weaknessScore: number;
}

/**
 * Squares performance per base number n (value, root and missing-value questions for the same n
 * share the concept `square:n`, so they are combined).
 */
export async function getSquareCells(userId: number): Promise<SquareCell[]> {
  const rows = await db
    .select({
      concept: questionStats.concept,
      attempts: sql<string>`SUM(${questionStats.totalAttempts})`,
      correct: sql<string>`SUM(${questionStats.correctAttempts})`,
      avgTime: sql<string>`COALESCE(SUM(${questionStats.averageResponseTimeMs} * ${questionStats.totalAttempts}) / NULLIF(SUM(${questionStats.totalAttempts}), 0), 0)`,
      weakness: sql<string>`AVG(${questionStats.weaknessScore})`,
    })
    .from(questionStats)
    .where(and(eq(questionStats.userId, userId), eq(questionStats.skill, "square"), attempted))
    .groupBy(questionStats.concept);

  const cells: SquareCell[] = [];
  for (const row of rows) {
    const n = Number(row.concept.split(":")[1]);
    const attempts = Number(row.attempts);
    if (Number.isInteger(n) && attempts > 0) {
      cells.push({
        n,
        attempts,
        correct: Number(row.correct),
        accuracy: Math.round((Number(row.correct) / attempts) * 100),
        averageResponseTimeMs: Math.round(Number(row.avgTime)),
        weaknessScore: Math.round(Number(row.weakness)),
      });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Activity (profile heatmap and streaks)
// ---------------------------------------------------------------------------

/**
 * Questions answered per calendar day, in the user's time zone, for the last `days` days.
 * Days are `YYYY-MM-DD` strings; days with no activity are absent.
 */
export async function getActivityByDay(userId: number, timeZone: string, days: number): Promise<Map<string, number>> {
  // The zone is a bind parameter, never interpolated into the SQL text.
  const day = sql<string>`to_char((${questionAttempts.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({ day, count: sql<string>`COUNT(*)` })
    .from(questionAttempts)
    .where(
      and(
        eq(questionAttempts.userId, userId),
        // A day of slack on each side of the window, so zone offsets can never clip the first or last day.
        gt(questionAttempts.createdAt, sql`NOW() - ${`${days + 1} days`}::interval`)
      )
    )
    // By position: the zone is a bind parameter, so a second copy of the expression in GROUP BY would
    // carry a different parameter and Postgres could not tell it matches the selected one.
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [r.day, Number(r.count)]));
}

/** Questions answered by a user since they started, across all skills. */
export async function getTotalAnswered(userId: number): Promise<number> {
  const [row] = await db.select({ total: sql<string>`COUNT(*)` }).from(questionAttempts).where(eq(questionAttempts.userId, userId));
  return Number(row?.total ?? 0);
}
