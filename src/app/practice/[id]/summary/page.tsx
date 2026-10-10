import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, isNotNull, ne } from "drizzle-orm";
import { ArrowRight, BarChart3, Check, Trophy } from "lucide-react";
import { db } from "@/db";
import { practiceSessions, questionAttempts } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Page, StatTile } from "@/components/page-header";
import ReviewButton from "@/components/review-button";
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

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const sessionId = parseId((await params).id);
  if (sessionId === null) notFound();

  const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId));
  if (!session) notFound();

  const missed = await db
    .select()
    .from(questionAttempts)
    .where(and(eq(questionAttempts.sessionId, sessionId), eq(questionAttempts.isCorrect, false)))
    .orderBy(asc(questionAttempts.createdAt));

  // Personal best among earlier timed sessions of the same length.
  let bestPrevious: number | null = null;
  if (session.mode === "timed" && session.durationSeconds) {
    const [best] = await db
      .select({ score: practiceSessions.totalCorrect })
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.mode, "timed"),
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

  const modeLabel =
    session.mode === "timed"
      ? `Timed · ${session.durationSeconds}s`
      : session.mode === "review"
        ? `Review · ${session.targetQuestionCount} missed questions`
        : session.mode === "fixed"
          ? `${session.targetQuestionCount} questions`
          : "Endless";
  const elapsed = session.endedAt ? formatDuration(session.endedAt.getTime() - session.startedAt.getTime()) : "—";
  const answered = session.actualQuestionCount > 0;

  return (
    <Page narrow>
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{modeLabel}</p>
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
        {bestPrevious !== null && bestPrevious > 0 && (
          <p className="text-muted-foreground">Previous best for this length: {bestPrevious} correct.</p>
        )}
      </div>

      {!answered ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No questions were answered in this session.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <StatTile
            label={session.mode === "timed" ? "Score" : "Correct"}
            value={`${session.totalCorrect}/${session.actualQuestionCount}`}
          />
          <StatTile
            label="Accuracy"
            value={`${session.accuracy}%`}
            tone={session.accuracy >= 85 ? "success" : session.accuracy >= 60 ? "warning" : "danger"}
          />
          <StatTile label="Avg response" value={`${(session.averageResponseTimeMs / 1000).toFixed(1)}s`} />
          <StatTile label="Time" value={elapsed} />
        </div>
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
              {missed.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {m.leftNumber} × {m.rightNumber} = {m.correctAnswer}
                  </span>
                  <span className="text-muted-foreground">
                    You answered{" "}
                    <span className="rounded bg-destructive-soft px-1.5 py-0.5 font-mono font-medium text-destructive">
                      {m.userAnswer}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start gap-3">
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Practice again <ArrowRight />
        </Link>
        {missed.length > 0 && <ReviewButton source={{ reviewSessionId: sessionId }} label="Retry missed" variant="outline" className="h-11 px-6 text-[15px]" />}
        <Link href="/progress" className={buttonVariants({ variant: "outline", size: "lg" })}>
          <BarChart3 /> View progress
        </Link>
      </div>
    </Page>
  );
}
