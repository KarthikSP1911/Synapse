"use client";

import { useMemo } from "react";
import { StatTile } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatSeconds } from "@/features/games/mindsprint/components/summary-screen";
import { DIFFICULTY_LEVELS } from "@/features/games/mindsprint/lib/config";
import { computeStats, type Bucket } from "@/features/games/mindsprint/lib/stats";
import { OPERATIONS, OPERATION_LABEL, OPERATION_SYMBOL, type SessionData } from "@/features/games/mindsprint/lib/types";

const barColor = (accuracy: number) => (accuracy >= 85 ? "bg-success" : accuracy >= 60 ? "bg-warning" : "bg-destructive");

function BucketRow({ label, bucket }: { label: React.ReactNode; bucket: Bucket }) {
  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex gap-3 font-mono text-xs tabular-nums text-muted-foreground">
          <span>{bucket.rounds} {bucket.rounds === 1 ? "round" : "rounds"}</span>
          <span>{bucket.rounds > 0 ? `${bucket.accuracy}%` : "—"}</span>
          <span>{bucket.averageResponseMs > 0 ? formatSeconds(bucket.averageResponseMs) : "—"}</span>
        </span>
      </div>
      <Progress value={bucket.accuracy} className="h-1.5 bg-secondary" indicatorColor={barColor(bucket.accuracy)} aria-label={`${bucket.accuracy}% accuracy`} />
    </li>
  );
}

/** Figures over every finished session on this device (and, for an account, the rest of its history). */
export function StatsPanel({ history }: { history: readonly SessionData[] | null }) {
  const stats = useMemo(() => (history ? computeStats(history) : null), [history]);

  if (!stats) {
    return (
      <div className="grid min-h-48 place-items-center" role="status" aria-label="Loading your stats">
        <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  if (stats.sessions === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-lg font-semibold tracking-tight">No sessions yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Finish a MindSprint session and your scores, accuracy and speed will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Best score" value={stats.bestScore.toLocaleString()} hint={`average ${stats.averageScore.toLocaleString()}`} />
        <StatTile label="Sessions" value={stats.sessions.toLocaleString()} hint={`${stats.rounds.toLocaleString()} rounds`} />
        <StatTile label="Accuracy" value={`${stats.accuracy}%`} tone={stats.accuracy >= 85 ? "success" : stats.accuracy >= 60 ? "warning" : "danger"} />
        <StatTile label="Avg response" value={stats.averageResponseMs === 0 ? "—" : formatSeconds(stats.averageResponseMs)} hint="to type an answer" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By difficulty</CardTitle>
            <CardDescription>Accuracy and answer speed for each difficulty level.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {DIFFICULTY_LEVELS.map((level) => (
                <BucketRow key={level} label={level} bucket={stats.byLevel[level]} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By operation</CardTitle>
            <CardDescription>A round counts toward every operation it used.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {OPERATIONS.map((op) => (
                <BucketRow
                  key={op}
                  label={
                    <>
                      <span className="mr-2 inline-block w-4 text-center font-mono text-muted-foreground" aria-hidden>
                        {OPERATION_SYMBOL[op]}
                      </span>
                      {OPERATION_LABEL[op]}
                    </>
                  }
                  bucket={stats.byOperation[op]}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
          <CardDescription>Your latest {stats.recent.length} {stats.recent.length === 1 ? "session" : "sessions"}, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="-mx-2 divide-y divide-border">
            {stats.recent.map((s) => (
              <li key={s.clientId} className="flex items-center justify-between gap-4 px-2 py-3 text-sm">
                <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="font-medium">{new Date(s.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {s.correct}/{s.total} correct · {s.accuracy}%
                  </span>
                </span>
                <span className="font-mono font-semibold tabular-nums">{s.score.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
