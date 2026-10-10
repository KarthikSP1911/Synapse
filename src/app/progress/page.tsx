import { db } from "@/db";
import Link from "next/link";
import { pairStatistics, practiceSessions } from "@/db/schema";
import ProgressCharts from "@/components/progress-charts";
import { sql, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Progress Dashboard</h1>
        <p className="text-muted-foreground">Track your learning statistics and identify areas for improvement.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalAttempts}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{overallAccuracy}%</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Response Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(avgTime / 1000).toFixed(2)}s</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Due for Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{duePairs}</div>
            <p className="text-xs text-muted-foreground mt-1">pairs scheduled by spaced repetition</p>
          </CardContent>
        </Card>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Critical Weaknesses</CardTitle>
            <CardDescription>Questions that need the most practice based on your history.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {weakestPairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data available yet. Start practicing!</p>
              ) : (
                weakestPairs.map(pair => (
                  <div key={`${pair.leftNumber}x${pair.rightNumber}`} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold text-lg">{pair.leftNumber} &times; {pair.rightNumber}</span>
                      <div className="flex space-x-4 text-muted-foreground">
                        <span>{pair.accuracy}%</span>
                        <span>{(pair.averageResponseTimeMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                    <Progress value={pair.weaknessScore} className="h-2 bg-muted" indicatorColor="bg-destructive" aria-label={`Weakness score ${pair.weaknessScore} out of 100`} />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary">Mastered Pairs</CardTitle>
            <CardDescription>Questions you have successfully mastered.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {strongestPairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keep practicing to master questions.</p>
              ) : (
                strongestPairs.map(pair => (
                  <div key={`${pair.leftNumber}x${pair.rightNumber}`} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold text-lg">{pair.leftNumber} &times; {pair.rightNumber}</span>
                      <div className="flex space-x-4 text-muted-foreground">
                        <span>{pair.accuracy}%</span>
                        <span>{(pair.averageResponseTimeMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                    <Progress value={100 - pair.weaknessScore} className="h-2 bg-muted" indicatorColor="bg-primary" aria-label={`Mastery ${100 - pair.weaknessScore} out of 100`} />
                  </div>
                ))
              )}
            </div>
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
            <ul className="divide-y divide-border">
              {[...recentSessions].reverse().slice(0, 10).map((s) => (
                <li key={s.id}>
                  <Link href={`/practice/${s.id}/summary`} className="flex items-center justify-between py-2.5 text-sm hover:text-primary">
                    <span>
                      {s.startedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      <span className="text-muted-foreground">
                        {" · "}
                        {s.mode === "timed" ? `${s.durationSeconds}s timed` : s.mode === "fixed" ? `${s.targetQuestionCount} Qs` : "Endless"}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {s.totalCorrect}/{s.actualQuestionCount} · {s.accuracy}%
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
