import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { practiceSessions, questionAttempts } from "@/db/schema";
import { SessionSummary } from "@/features/skills/components/session-summary";
import { SKILLS, type Skill } from "@/features/skills/lib/types";
import { getViewer } from "@/features/auth/server/auth";
import { summaryHref } from "@/features/offline/lib/local-store";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session summary" };

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const sessionId = parseId((await params).id);
  if (sessionId === null) notFound();
  // A guest's sessions are in their browser, not the database; the offline-capable page shows them.
  if (viewer.kind === "guest") redirect(summaryHref(sessionId));
  const user = viewer.user;

  // Another user's session id is indistinguishable from one that does not exist.
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, user.id)));
  if (!session) notFound();
  const skill = (SKILLS.includes(session.skill as Skill) ? session.skill : "multiplication") as Skill;

  const [missed, byType] = await Promise.all([
    db
      .select()
      .from(questionAttempts)
      .where(and(eq(questionAttempts.sessionId, sessionId), eq(questionAttempts.isCorrect, false)))
      .orderBy(asc(questionAttempts.createdAt)),
    db
      .select({
        exerciseType: questionAttempts.exerciseType,
        attempted: sql<string>`COUNT(*)`,
        correct: sql<string>`COUNT(*) FILTER (WHERE ${questionAttempts.isCorrect})`,
        avgTime: sql<string>`COALESCE(AVG(${questionAttempts.responseTimeMs}), 0)`,
      })
      .from(questionAttempts)
      .where(eq(questionAttempts.sessionId, sessionId))
      .groupBy(questionAttempts.exerciseType)
      .orderBy(asc(questionAttempts.exerciseType)),
  ]);

  // Personal best among earlier timed sessions of the same skill and length.
  let bestPrevious: number | null = null;
  if (session.mode === "timed" && session.durationSeconds) {
    const [best] = await db
      .select({ score: practiceSessions.totalCorrect })
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.userId, user.id),
          eq(practiceSessions.mode, "timed"),
          eq(practiceSessions.skill, session.skill),
          eq(practiceSessions.durationSeconds, session.durationSeconds),
          ne(practiceSessions.id, sessionId),
          isNotNull(practiceSessions.endedAt),
          gt(practiceSessions.actualQuestionCount, 0)
        )
      )
      .orderBy(desc(practiceSessions.totalCorrect))
      .limit(1);
    bestPrevious = best?.score ?? 0;
  }

  return (
    <SessionSummary
      session={{ ...session, skill }}
      missed={missed}
      byType={byType.map((t) => ({
        exerciseType: t.exerciseType,
        attempted: Number(t.attempted),
        correct: Number(t.correct),
        averageResponseTimeMs: Number(t.avgTime),
      }))}
      bestPrevious={bestPrevious}
      sessionId={sessionId}
    />
  );
}
