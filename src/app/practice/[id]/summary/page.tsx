import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { practiceSessions, questionAttempts } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ReviewButton from "@/components/review-button";
import { parseId } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session summary" };

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
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

  const tiles = [
    { label: session.mode === "timed" ? "Score" : "Correct", value: `${session.totalCorrect} / ${session.actualQuestionCount}` },
    { label: "Accuracy", value: `${session.accuracy}%` },
    { label: "Avg response", value: `${(session.averageResponseTimeMs / 1000).toFixed(1)}s` },
    { label: "Time", value: elapsed },
  ];

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Session summary</h1>
          {isRecord && (
            <span className="rounded-full bg-primary/15 text-primary text-xs font-semibold px-2.5 py-1">New record!</span>
          )}
        </div>
        <p className="text-muted-foreground">
          {modeLabel}
          {bestPrevious !== null && bestPrevious > 0 && ` · previous best ${bestPrevious}`}
        </p>
      </div>

      {session.actualQuestionCount === 0 ? (
        <p className="text-muted-foreground">No questions were answered in this session.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tiles.map(({ label, value }) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Missed questions</CardTitle>
          <CardDescription>Review these before your next session.</CardDescription>
        </CardHeader>
        <CardContent>
          {missed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {session.actualQuestionCount > 0 ? "Perfect session, nothing missed!" : "Nothing to review."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {missed.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-bold text-base">
                    {m.leftNumber} &times; {m.rightNumber} = {m.correctAnswer}
                  </span>
                  <span className="text-muted-foreground">
                    you answered <span className="text-destructive font-medium">{m.userAnswer}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start gap-3">
        {missed.length > 0 && (
          <ReviewButton source={{ reviewSessionId: sessionId }} label="Retry missed" />
        )}
        <Link
          href="/"
          className="h-10 px-5 inline-flex items-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110"
        >
          Practice again
        </Link>
        <Link
          href="/progress"
          className="h-10 px-5 inline-flex items-center rounded-lg border border-border text-sm font-medium hover:bg-secondary"
        >
          View progress
        </Link>
      </div>
    </div>
  );
}
