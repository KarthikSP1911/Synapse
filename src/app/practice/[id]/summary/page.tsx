import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { ArrowRight, BarChart3, Check, Lightbulb, Trophy } from "lucide-react";
import { db } from "@/db";
import { practiceSessions, questionAttempts } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Page, StatTile } from "@/components/page-header";
import ReviewButton from "@/components/review-button";
import { SkillIcon } from "@/components/skill-icon";
import { exerciseLabel, modeLabel, skillTitle } from "@/lib/skills/meta";
import { questionFromId } from "@/lib/skills/build";
import { SKILLS, type Skill } from "@/lib/skills/types";
import { requireUser } from "@/lib/auth";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session summary" };

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

function verdict(accuracy: number) {
  if (accuracy >= 95) return "Outstanding";
  if (accuracy >= 85) return "Great work";
  if (accuracy >= 70) return "Solid session";
  if (accuracy >= 50) return "Getting there";
  return "Keep practising";
}

const missLabel: Record<string, string> = { incorrect: "", skipped: "Skipped", timed_out: "Timed out" };

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const sessionId = parseId((await params).id);
  if (sessionId === null) notFound();

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
  const isRecord = bestPrevious !== null && session.totalCorrect > bestPrevious;

  // Time on task excludes any time the session spent paused.
  const elapsed = session.endedAt
    ? formatDuration(session.endedAt.getTime() - session.startedAt.getTime() - session.pausedMs)
    : "—";
  const answered = session.actualQuestionCount > 0;
  const typeLabels = byType.map((t) => exerciseLabel(skill, t.exerciseType));

  return (
    <Page narrow>
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <SkillIcon skill={skill} className="size-3.5" />
          <span>{skillTitle(skill)}</span>
          <span aria-hidden>·</span>
          <span>{modeLabel(session)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {answered ? verdict(session.accuracy) : "Session summary"}
          </h1>
          {isRecord && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">
              <Trophy className="size-3.5" /> New personal best
            </span>
          )}
        </div>
        {typeLabels.length > 0 && <p className="text-muted-foreground">{typeLabels.join(" · ")}</p>}
        {bestPrevious !== null && bestPrevious > 0 && (
          <p className="text-muted-foreground">Previous best for this length: {bestPrevious} correct.</p>
        )}
      </div>

      {!answered ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No questions were answered in this session.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatTile
              label={session.mode === "timed" ? "Score" : "Correct"}
              value={`${session.totalCorrect}/${session.actualQuestionCount}`}
              hint={`${session.actualQuestionCount} attempted · ${session.totalIncorrect} missed`}
            />
            <StatTile
              label="Accuracy"
              value={`${session.accuracy}%`}
              tone={session.accuracy >= 85 ? "success" : session.accuracy >= 60 ? "warning" : "danger"}
            />
            <StatTile label="Avg response" value={`${(session.averageResponseTimeMs / 1000).toFixed(1)}s`} />
            <StatTile label="Time" value={elapsed} hint={session.pausedMs > 0 ? "excluding pauses" : undefined} />
          </div>

          {byType.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>By exercise type</CardTitle>
                <CardDescription>How each kind of question went this session.</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">Exercise</th>
                      <th scope="col" className="pb-2 text-right font-medium">Correct</th>
                      <th scope="col" className="pb-2 text-right font-medium">Accuracy</th>
                      <th scope="col" className="pb-2 text-right font-medium">Avg time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byType.map((t) => {
                      const attempted = Number(t.attempted);
                      const correct = Number(t.correct);
                      return (
                        <tr key={t.exerciseType}>
                          <th scope="row" className="py-2.5 text-left font-medium">{exerciseLabel(skill, t.exerciseType)}</th>
                          <td className="py-2.5 text-right font-mono tabular-nums">{correct}/{attempted}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{Math.round((correct / attempted) * 100)}%</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{(Number(t.avgTime) / 1000).toFixed(1)}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Missed questions</CardTitle>
          <CardDescription>Review these before your next session.</CardDescription>
        </CardHeader>
        <CardContent>
          {missed.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {answered ? (
                <>
                  <Check className="size-4 text-success" /> Perfect session, nothing missed.
                </>
              ) : (
                "Nothing to review."
              )}
            </p>
          ) : (
            <ul className="-my-1 divide-y divide-border">
              {missed.map((m) => {
                const explanation = questionFromId(m.questionId)?.explanation;
                return (
                  <li key={m.id} className="space-y-1.5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-mono text-base font-semibold tabular-nums">
                        {m.prompt} <span className="text-muted-foreground">→</span> {m.correctAnswerText}
                      </span>
                      <span className="text-muted-foreground">
                        {m.outcome !== "incorrect" ? (
                          <span className="rounded bg-warning-soft px-1.5 py-0.5 font-medium text-warning">{missLabel[m.outcome] ?? m.outcome}</span>
                        ) : (
                          <>
                            You answered{" "}
                            <span className="rounded bg-destructive-soft px-1.5 py-0.5 font-mono font-medium text-destructive">
                              {m.userAnswerText ?? "—"}
                            </span>
                          </>
                        )}
                        {m.hinted && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs">
                            <Lightbulb className="size-3" /> hint used
                          </span>
                        )}
                      </span>
                    </div>
                    {explanation && <p className="text-muted-foreground">{explanation}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start gap-3">
        <Link href={skill === "multiplication" ? "/" : `/?skill=${skill}`} className={buttonVariants({ size: "lg" })}>
          Practice again <ArrowRight />
        </Link>
        {missed.length > 0 && <ReviewButton source={{ reviewSessionId: sessionId }} label="Retry missed" variant="outline" className="h-11 px-6 text-[15px]" />}
        <Link href={`/progress?skill=${skill}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <BarChart3 /> View progress
        </Link>
      </div>
    </Page>
  );
}
