"use client";

import { StatTile } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/features/games/game2048/components/format";
import type { Stats2048 } from "@/features/games/game2048/lib/stats";
import { WIN_TILE } from "@/features/games/game2048/lib/types";

/** Totals over every game played, the highest tiles reached, and the latest games. */
export function StatsPanel({ stats }: { stats: Stats2048 | null }) {
  if (!stats) {
    return (
      <div className="grid min-h-48 place-items-center" role="status" aria-label="Loading your stats">
        <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  if (stats.gamesPlayed === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-lg font-semibold tracking-tight">No finished games yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">A game counts once it ends or you start a new one after making a move. Your scores and tiles will show up here.</p>
      </div>
    );
  }

  const most = Math.max(...stats.byTile.map((t) => t.games));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Games played" value={stats.gamesPlayed.toLocaleString()} hint={`${stats.totalMoves.toLocaleString()} moves in total`} />
        <StatTile label="Reached 2048" value={stats.gamesWon.toLocaleString()} tone={stats.gamesWon > 0 ? "success" : undefined} hint={`${stats.winRate}% of games`} />
        <StatTile label="High score" value={stats.highScore.toLocaleString()} hint={`average ${stats.averageScore.toLocaleString()}`} />
        <StatTile label="Best tile" value={stats.bestTile.toLocaleString()} hint={`${formatDuration(stats.totalDurationMs)} played`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Highest tile per game</CardTitle>
          <CardDescription>How many games ended with each tile as the biggest.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {stats.byTile.map((t) => (
              <li key={t.tile} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-mono font-semibold tabular-nums">{t.tile.toLocaleString()}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {t.games} {t.games === 1 ? "game" : "games"}
                  </span>
                </div>
                <Progress value={(t.games * 100) / most} className="h-1.5 bg-secondary" indicatorColor={t.tile >= WIN_TILE ? "bg-success" : "bg-foreground"} aria-label={`${t.games} games with highest tile ${t.tile}`} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent games</CardTitle>
          <CardDescription>
            Your latest {stats.recent.length} {stats.recent.length === 1 ? "game" : "games"}, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="-mx-2 divide-y divide-border">
            {stats.recent.map((s) => (
              <li key={s.clientId} className="flex items-center justify-between gap-4 px-2 py-3 text-sm">
                <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="font-medium">{new Date(s.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    tile {s.highestTile.toLocaleString()} · {s.moves.toLocaleString()} moves · {formatDuration(s.durationMs)}
                    {s.reached2048 ? " · reached 2048" : s.gameOver ? "" : " · left unfinished"}
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
