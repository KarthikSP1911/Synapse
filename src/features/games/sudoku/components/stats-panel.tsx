"use client";

import { useState } from "react";
import { StatTile } from "@/components/layout/page-header";
import { Chip } from "@/components/form/setup-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime, scoreGame } from "@/features/games/sudoku/lib/scoring";
import type { SudokuStats } from "@/features/games/sudoku/lib/stats";
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from "@/features/games/sudoku/lib/types";

/** Figures for one difficulty at a time, with a short list of the latest games across all of them. */
export function StatsPanel({ stats, initialDifficulty }: { stats: SudokuStats | null; initialDifficulty: Difficulty }) {
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);

  if (!stats) {
    return (
      <div className="grid min-h-48 place-items-center" role="status" aria-label="Loading your stats">
        <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  const own = stats.byDifficulty[difficulty];

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Difficulty" className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
        {DIFFICULTIES.map((d) => (
          <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)} className="text-[13px]">
            {DIFFICULTY_LABEL[d]} <span className="ml-1.5 font-mono text-xs opacity-70">{stats.byDifficulty[d].completed}</span>
          </Chip>
        ))}
      </div>

      {own.attempted === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">No {DIFFICULTY_LABEL[difficulty].toLowerCase()} puzzles yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Start a puzzle at this level and your times and scores will show up here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label="Solved" value={`${own.completed}/${own.attempted}`} hint={`${own.completionRate}% completion rate`} />
          <StatTile label="Best time" value={own.bestTimeMs === null ? "—" : formatTime(own.bestTimeMs)} hint={own.averageTimeMs === null ? "no solved puzzle yet" : `average ${formatTime(own.averageTimeMs)}`} />
          <StatTile label="Best score" value={own.bestScore === 0 ? "—" : own.bestScore.toLocaleString()} />
          <StatTile label="Without hints" value={own.independent} hint={`${own.hintsUsed} ${own.hintsUsed === 1 ? "hint" : "hints"}, ${own.mistakes} ${own.mistakes === 1 ? "mistake" : "mistakes"} in total`} />
        </div>
      )}

      {stats.recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent games</CardTitle>
            <CardDescription>
              Your latest {stats.recent.length} {stats.recent.length === 1 ? "game" : "games"} at any difficulty, newest first. {stats.completed} solved out of {stats.attempted} started ({stats.completionRate}%).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2 divide-y divide-border">
              {stats.recent.map((s) => (
                <li key={s.clientId} className="flex items-center justify-between gap-4 px-2 py-3 text-sm">
                  <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="font-medium">
                      {DIFFICULTY_LABEL[s.difficulty]} · {new Date(s.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTime(s.elapsedMs)} · {s.mistakes} {s.mistakes === 1 ? "mistake" : "mistakes"} · {s.hintsUsed} {s.hintsUsed === 1 ? "hint" : "hints"}
                    </span>
                  </span>
                  <span className={s.completed ? "font-mono font-semibold tabular-nums" : "text-xs text-muted-foreground"}>{s.completed ? scoreGame(s).total.toLocaleString() : "Not solved"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
