import { db } from "@/db";
import Link from "next/link";
import { pairStatistics, practiceSessions } from "@/db/schema";
import ProgressCharts from "@/components/progress-charts";
import { sql, desc } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { Page, PageHeader, StatTile } from "@/components/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

type PairRowData = {
  leftNumber: number;
  rightNumber: number;
  accuracy: number;
  averageResponseTimeMs: number;
  weaknessScore: number;
};

function PairList({
  pairs,
  score,
  color,
  empty,
}: {
  pairs: PairRowData[];
  score: (p: PairRowData) => number;
  color: string;
  empty: string;
}) {
  if (pairs.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-4">
      {pairs.map((pair) => (
        <li key={`${pair.leftNumber}x${pair.rightNumber}`} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-base font-semibold tabular-nums">
              {pair.leftNumber} × {pair.rightNumber}
            </span>
            <span className="flex gap-3 font-mono text-xs tabular-nums text-muted-foreground">
              <span>{pair.accuracy}%</span>
              <span>{(pair.averageResponseTimeMs / 1000).toFixed(1)}s</span>
            </span>
          </div>
          <Progress
            value={score(pair)}
            className="h-1.5 bg-secondary"
            indicatorColor={color}
            aria-label={`${score(pair)} out of 100`}
          />
        </li>
      ))}
    </ul>
  );
}

export default async function ProgressPage() {
  // Aggregate Stats
  const [aggregate] = await db.select({
    totalAttempts: sql<string>`COALESCE(SUM(${pairStatistics.totalAttempts}), 0)`,
    totalCorrect: sql<string>`COALESCE(SUM(${pairStatistics.correctAttempts}), 0)`,
    // Weighted by attempts so rarely-seen pairs don't skew the average.
    avgTime: sql<string>`COALESCE(SUM(${pairStatistics.averageResponseTimeMs} * ${pairStatistics.totalAttempts}) / NULLIF(SUM(${pairStatistics.totalAttempts}), 0), 0)`,
  }).from(pairStatistics);

  const totalAttempts = Number(aggregate.totalAttempts);
  const totalCorrect = Number(aggregate.totalCorrect);
  const avgTime = Number(aggregate.avgTime);

  // Pairs whose spaced-repetition review date has passed (or was never scheduled).
  const [{ dueCount }] = await db.select({
    dueCount: sql<string>`COUNT(*) FILTER (WHERE ${pairStatistics.totalAttempts} > 0 AND (${pairStatistics.dueAt} IS NULL OR ${pairStatistics.dueAt} <= NOW()))`,
  }).from(pairStatistics);
  const duePairs = Number(dueCount);

  const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // Weakest Pairs
  const weakestPairs = await db.select()
    .from(pairStatistics)
    .where(sql`${pairStatistics.totalAttempts} > 0`)
    .orderBy(desc(pairStatistics.weaknessScore))
    .limit(10);

  // Strongest Pairs
  const strongestPairs = await db.select()
    .from(pairStatistics)
    .where(sql`${pairStatistics.totalAttempts} > 4`)
    .orderBy(pairStatistics.weaknessScore)
    .limit(5);

  // Last 30 sessions with at least one answer, oldest first for the chart.
  const recentSessions = (
    await db
      .select()
      .from(practiceSessions)
      .where(sql`${practiceSessions.actualQuestionCount} > 0`)
      .orderBy(desc(practiceSessions.startedAt))
      .limit(30)
  ).reverse();

  const chartData = recentSessions.map((s) => ({
    label: s.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    accuracy: s.accuracy,
    avgSeconds: Math.round(s.averageResponseTimeMs / 100) / 10,
  }));

  return (
    <Page>
      <PageHeader
        eyebrow="Dashboard"
        title="Your progress"
        description="Track accuracy and speed over time, and see exactly which pairs need more work."
        actions={
          <Link href="/" className={buttonVariants({})}>
            Practice <ArrowRight />
          </Link>
        }
      />

      {totalAttempts === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">No data yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Complete a practice session and your accuracy, speed and weak spots will show up here.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-6" })}>
            Start your first session
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile label="Total questions" value={totalAttempts.toLocaleString()} />
            <StatTile
              label="Overall accuracy"
              value={`${overallAccuracy}%`}
              tone={overallAccuracy >= 85 ? "success" : overallAccuracy >= 60 ? "warning" : "danger"}
            />
            <StatTile label="Avg response time" value={`${(avgTime / 1000).toFixed(2)}s`} />
            <StatTile label="Due for review" value={duePairs} hint="pairs scheduled by spaced repetition" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trend</CardTitle>
              <CardDescription>Accuracy and average response time across your last 30 sessions.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressCharts data={chartData} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-destructive" /> Needs work
                </CardTitle>
                <CardDescription>Your ten weakest pairs, based on accuracy and speed.</CardDescription>
              </CardHeader>
              <CardContent>
                <PairList
                  pairs={weakestPairs}
                  score={(p) => p.weaknessScore}
                  color="bg-destructive"
                  empty="No data available yet. Start practising!"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" /> Mastered
                </CardTitle>
                <CardDescription>Pairs you answer quickly and correctly (5+ attempts).</CardDescription>
              </CardHeader>
              <CardContent>
                <PairList
                  pairs={strongestPairs}
                  score={(p) => 100 - p.weaknessScore}
                  color="bg-success"
                  empty="Keep practising to master pairs."
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>Select a session to review its results.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              ) : (
                <ul className="-mx-2 divide-y divide-border">
                  {[...recentSessions].reverse().slice(0, 10).map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/practice/${s.id}/summary`}
                        className="group flex items-center justify-between gap-4 rounded-md px-2 py-3 text-sm transition-colors hover:bg-accent"
                      >
                        <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                          <span className="font-medium">
                            {s.startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span className="text-muted-foreground">
                            {s.mode === "timed"
                              ? `${s.durationSeconds}s timed`
                              : s.mode === "fixed"
                                ? `${s.targetQuestionCount} questions`
                                : s.mode === "review"
                                  ? "Review"
                                  : "Endless"}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 font-mono text-xs tabular-nums">
                          <span className="text-muted-foreground">
                            {s.totalCorrect}/{s.actualQuestionCount}
                          </span>
                          <span className={s.accuracy >= 85 ? "text-success" : s.accuracy >= 60 ? "text-warning" : "text-destructive"}>
                            {s.accuracy}%
                          </span>
                          <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  );
}
