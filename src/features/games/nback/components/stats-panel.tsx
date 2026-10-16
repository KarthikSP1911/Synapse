"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { StatTile } from "@/components/layout/page-header";
import { Chip } from "@/components/form/choice-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { analyze } from "@/features/games/nback/lib/analysis";
import { activeStreams } from "@/features/games/nback/lib/config";
import { computeStats, progressPoints } from "@/features/games/nback/lib/stats";
import { MODE_LABEL, STREAM_MODES, STREAM_LABEL, type SessionData, type StreamMode } from "@/features/games/nback/lib/types";

// Recharts is only needed on this tab, so it loads when the tab opens.
const ProgressChart = dynamic(() => import("@/features/games/nback/components/progress-chart"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-secondary" aria-hidden />,
});

/** Figures and charts for the sessions on this account or device, all together or one stream mode at a time. */
export function StatsPanel({ history }: { history: readonly SessionData[] | null }) {
  const [filter, setFilter] = useState<StreamMode | "all">("all");
  const stats = useMemo(() => (history ? computeStats(history) : null), [history]);
  const points = useMemo(() => (history ? progressPoints(history, filter) : []), [history, filter]);

  if (!history || !stats) {
    return (
      <div className="grid min-h-48 place-items-center" role="status" aria-label="Loading your stats">
        <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  const shown = filter === "all" ? stats.all : stats.byMode[filter];
  const recent = history
    .filter((s) => filter === "all" || analyze(s).mode === filter)
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 10);
  const bestMode = STREAM_MODES.reduce<StreamMode | null>((top, m) => (stats.byMode[m].bestN > (top ? stats.byMode[top].bestN : 0) ? m : top), null);

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Stream mode" className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} className="text-[13px]">
          All <span className="ml-1.5 font-mono text-xs opacity-70">{stats.all.sessions}</span>
        </Chip>
        {STREAM_MODES.map((mode) => (
          <Chip key={mode} active={filter === mode} onClick={() => setFilter(mode)} className="text-[13px]">
            {MODE_LABEL[mode]} <span className="ml-1.5 font-mono text-xs opacity-70">{stats.byMode[mode].sessions}</span>
          </Chip>
        ))}
      </div>

      {shown.sessions === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">{filter === "all" ? "No N-Back sessions yet" : `No ${MODE_LABEL[filter].toLowerCase()} sessions yet`}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Finish a session, or run out of lives, and your accuracy and n level will show up here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Best n"
              value={shown.bestN === 0 ? "—" : shown.bestN}
              hint={shown.bestN === 0 ? "needs a completed session at 80%+" : filter === "all" && bestMode ? `${MODE_LABEL[bestMode].toLowerCase()} n-back` : "completed at 80%+ accuracy"}
            />
            <StatTile label="Completed" value={shown.completed} hint={`${shown.gameOvers} ${shown.gameOvers === 1 ? "game over" : "game overs"}`} />
            <StatTile label="Average accuracy" value={shown.averageAccuracy === null ? "—" : `${shown.averageAccuracy}%`} tone={shown.averageAccuracy === null ? undefined : shown.averageAccuracy >= 80 ? "success" : shown.averageAccuracy >= 50 ? "warning" : "danger"} hint="completed sessions" />
            <StatTile label="Best score" value={shown.bestScore.toLocaleString()} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Accuracy over time</CardTitle>
                <CardDescription>Overall accuracy of each session. A cross marks a Game Over.</CardDescription>
              </CardHeader>
              <CardContent>
                {points.length < 2 ? <NeedMore /> : <ProgressChart data={points} metric="accuracy" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>n level over time</CardTitle>
                <CardDescription>The n of each session. With adaptive n on it follows your accuracy.</CardDescription>
              </CardHeader>
              <CardContent>
                {points.length < 2 ? <NeedMore /> : <ProgressChart data={points} metric="n" />}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
              <CardDescription>
                Your latest {recent.length} {recent.length === 1 ? "session" : "sessions"}, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="-mx-2 divide-y divide-border">
                {recent.map((s) => {
                  const a = analyze(s);
                  return (
                    <li key={s.clientId} className="flex items-center justify-between gap-4 px-2 py-3 text-sm">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{new Date(s.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        <span className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                          n = {s.config.n} · {activeStreams(s.config).map((st) => STREAM_LABEL[st]).join(" + ")} · {s.config.grid}×{s.config.grid}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-mono font-semibold tabular-nums">{Math.round(a.accuracy)}%</span>
                        <span className="text-xs text-muted-foreground">{s.outcome === "gameover" ? "Game over" : "Completed"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function NeedMore() {
  return <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Play at least two sessions to see a trend.</div>;
}
