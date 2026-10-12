"use client";

import Link from "next/link";
import { ArrowLeft, RotateCcw, SlidersHorizontal, Trophy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Page, PageHeader, StatTile } from "@/components/page-header";
import { formatTime, scoreGame } from "@/lib/sudoku/scoring";
import { DIFFICULTY_LABEL, type SessionData } from "@/lib/sudoku/types";
import { cn } from "@/lib/utils";

export type SaveState = "saved" | "failed";

/** The end-of-game screen: what happened, how the points add up, and where to go next. */
export function ResultScreen({
  data,
  previousBestMs,
  saveState,
  onReplay,
  onChangeDifficulty,
}: {
  data: SessionData;
  /** Fastest solve at this difficulty before this game, or null. */
  previousBestMs: number | null;
  saveState: SaveState;
  onReplay: () => void;
  onChangeDifficulty: () => void;
}) {
  const score = scoreGame(data);
  const newBest = data.completed && (previousBestMs === null || data.elapsedMs < previousBestMs);
  const label = DIFFICULTY_LABEL[data.difficulty];

  return (
    <Page narrow>
      <PageHeader
        accent="sudoku"
        eyebrow={`${label} puzzle`}
        title={data.completed ? "Puzzle solved" : "Solution revealed"}
        description={
          data.completed
            ? data.hintsUsed === 0
              ? "Solved on your own, without a single hint."
              : `Solved with ${data.hintsUsed} ${data.hintsUsed === 1 ? "hint" : "hints"}.`
            : "This game was not counted as solved."
        }
        actions={
          <>
            <Button variant="outline" onClick={onChangeDifficulty}>
              <SlidersHorizontal /> Another difficulty
            </Button>
            <Button onClick={onReplay} autoFocus>
              <RotateCcw /> Play again
            </Button>
          </>
        }
      />

      {newBest && (
        <p role="status" className="animate-pop flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success">
          <Trophy className="size-4" aria-hidden />
          {previousBestMs === null ? `First ${label.toLowerCase()} puzzle solved.` : `New best time, ${formatTime(previousBestMs - data.elapsedMs)} faster than before.`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Score" value={data.completed ? score.total.toLocaleString() : "—"} hint={data.completed ? undefined : "not solved"} />
        <StatTile label="Time" value={formatTime(data.elapsedMs)} hint="playing time, pauses excluded" />
        <StatTile label="Mistakes" value={data.mistakes} tone={data.mistakes === 0 ? "success" : undefined} />
        <StatTile label="Hints used" value={data.hintsUsed} tone={data.hintsUsed === 0 ? "success" : undefined} />
      </div>

      {data.completed && (
        <section aria-labelledby="sdk-score-heading" className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 id="sdk-score-heading" className="text-[15px] font-semibold tracking-tight">
            How the score adds up
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label} puzzle</dt>
              <dd className="font-mono tabular-nums">{score.base.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Time bonus</dt>
              <dd className="font-mono tabular-nums text-success">+{score.timeBonus.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Mistakes</dt>
              <dd className="font-mono tabular-nums">−{score.mistakePenalty.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Hints</dt>
              <dd className="font-mono tabular-nums">−{score.hintPenalty.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{score.total.toLocaleString()}</dd>
            </div>
          </dl>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/#games" className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")}>
          <ArrowLeft /> Back to Games
        </Link>
        <p role="status" className={cn("text-xs", saveState === "failed" ? "text-warning" : "text-muted-foreground")}>
          {saveState === "saved" ? "Saved to your progress." : "This game could not be saved: the browser's storage is full or blocked."}
        </p>
      </div>
    </Page>
  );
}
