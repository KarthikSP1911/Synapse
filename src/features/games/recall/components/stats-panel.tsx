"use client";

import { useMemo, useState } from "react";
import { StatTile } from "@/components/layout/page-header";
import { Chip } from "@/components/form/choice-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatSeconds } from "@/features/games/shared/lib/format";
import { computeAllStats } from "@/features/games/recall/lib/stats";
import { ITEM_NAME, MODE_LABEL, RECALL_MODES, type RecallMode, type SessionData } from "@/features/games/recall/lib/types";

const barColor = (accuracy: number) => (accuracy >= 85 ? "bg-success" : accuracy >= 50 ? "bg-warning" : "bg-destructive");

/** Figures for one mode at a time: single-digit and two-digit recall are separate skills and never mixed. */
export function StatsPanel({ history, initialMode }: { history: readonly SessionData[] | null; initialMode: RecallMode }) {
  const [mode, setMode] = useState<RecallMode>(initialMode);
  const all = useMemo(() => (history ? computeAllStats(history) : null), [history]);

  if (!all) {
    return (
      <div className="grid min-h-48 place-items-center" role="status" aria-label="Loading your stats">
        <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  const stats = all[mode];
  const [itemOne, itemMany] = ITEM_NAME[mode];

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Mode" className="grid max-w-md grid-cols-2 gap-2">
        {RECALL_MODES.map((m) => (
          <Chip key={m} active={mode === m} onClick={() => setMode(m)} className="text-[13px]">
            {MODE_LABEL[m]} <span className="ml-1.5 font-mono text-xs opacity-70">{all[m].sessions}</span>
          </Chip>
        ))}
      </div>

      {stats.sessions === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">No {MODE_LABEL[mode].toLowerCase()} sessions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Finish a session in this mode and your scores and longest recall will show up here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile label="Best score" value={stats.bestScore.toLocaleString()} hint={`average ${stats.averageScore.toLocaleString()}`} />
            <StatTile label="Longest recalled" value={stats.longestRecalled === 0 ? "—" : stats.longestRecalled} hint={stats.longestRecalled === 0 ? "no perfect round yet" : stats.longestRecalled === 1 ? itemOne : itemMany} />
            <StatTile label="Accuracy" value={`${stats.accuracy}%`} tone={stats.accuracy >= 85 ? "success" : stats.accuracy >= 50 ? "warning" : "danger"} hint="rounds recalled perfectly" />
            <StatTile label="Rounds" value={stats.rounds.toLocaleString()} hint={`${stats.sessions} ${stats.sessions === 1 ? "session" : "sessions"}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By sequence length</CardTitle>
              <CardDescription>How often a sequence of each length was recalled perfectly, and how many items landed in the right place.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {stats.byLength.map((b) => (
                  <li key={b.length} className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium">
                        {b.length} {b.length === 1 ? itemOne : itemMany}
                      </span>
                      <span className="flex gap-3 font-mono text-xs tabular-nums text-muted-foreground">
                        <span>
                          {b.perfect}/{b.rounds} perfect
                        </span>
                        <span>{b.accuracy}%</span>
                        <span>{b.positionAccuracy}% in place</span>
                      </span>
                    </div>
                    <Progress value={b.accuracy} className="h-1.5 bg-secondary" indicatorColor={barColor(b.accuracy)} aria-label={`${b.accuracy}% of rounds of ${b.length} perfect`} />
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {stats.positionAccuracy}% of all items recalled in the right place
                {stats.averageResponseMs > 0 ? ` · ${formatSeconds(stats.averageResponseMs)} average to answer` : ""}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>
                Your latest {stats.recent.length} {MODE_LABEL[mode].toLowerCase()} {stats.recent.length === 1 ? "session" : "sessions"}, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="-mx-2 divide-y divide-border">
                {stats.recent.map((s) => (
                  <li key={s.clientId} className="flex items-center justify-between gap-4 px-2 py-3 text-sm">
                    <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="font-medium">{new Date(s.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {s.perfect}/{s.total} perfect · longest {s.longest === 0 ? "—" : s.longest}
                      </span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums">{s.score.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
