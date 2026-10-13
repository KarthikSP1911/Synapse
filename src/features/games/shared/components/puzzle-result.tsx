"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Page, PageHeader, StatTile } from "@/components/layout/page-header";
import { RecordBanner, ResultActions, SaveStatus, type SaveState } from "@/features/games/shared/components/result-parts";
import { DIFFICULTY_LABEL, formatTime, type ScoreBreakdown } from "@/features/games/shared/lib/puzzle-session";
import type { PuzzleRecord } from "@/features/games/shared/lib/puzzle-stats";
import type { AccentId } from "@/lib/accent";
import { cn } from "@/lib/utils";

/** The end-of-game screen for Queens and Zip: what happened, how the points add up, and where to go next. */
export function PuzzleResultScreen({
  accent,
  name,
  noun,
  data,
  score,
  previousBestMs,
  previousBestScore,
  saveState,
  onReplay,
  onChangeDifficulty,
}: {
  accent: AccentId;
  name: string;
  noun: string;
  data: PuzzleRecord;
  score: ScoreBreakdown;
  /** Fastest solve at this difficulty before this game, or null. */
  previousBestMs: number | null;
  /** Best score at this difficulty before this game (0 for none). */
  previousBestScore: number;
  saveState: SaveState;
  onReplay: () => void;
  onChangeDifficulty: () => void;
}) {
  const label = DIFFICULTY_LABEL[data.difficulty];
  const newBestTime = previousBestMs === null || data.elapsedMs < previousBestMs;
  const newBestScore = score.total > previousBestScore;
  const id = `${accent}-score-heading`;

  return (
    <Page narrow>
      <PageHeader
        accent={accent}
        eyebrow={`${name} · ${label}`}
        title={`${noun[0].toUpperCase()}${noun.slice(1)} solved`}
        description={data.hintsUsed === 0 ? "Solved on your own, without a single hint." : `Solved with ${data.hintsUsed} ${data.hintsUsed === 1 ? "hint" : "hints"}.`}
        actions={<ResultActions onChange={onChangeDifficulty} onReplay={onReplay} changeLabel="Another difficulty" />}
      />

      {(newBestTime || newBestScore) && (
        <RecordBanner>
          {previousBestMs === null
            ? `First ${label.toLowerCase()} ${noun} solved.`
            : newBestTime
              ? `New best time, ${formatTime(previousBestMs - data.elapsedMs)} faster than before.`
              : `New best score, ${(score.total - previousBestScore).toLocaleString()} points more than before.`}
        </RecordBanner>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Score" value={score.total.toLocaleString()} />
        <StatTile label="Time" value={formatTime(data.elapsedMs)} hint="playing time, pauses excluded" />
        <StatTile label="Hints used" value={data.hintsUsed} tone={data.hintsUsed === 0 ? "success" : undefined} />
        <StatTile label="Solved" value={data.hintsUsed === 0 ? "On your own" : "With help"} tone={data.hintsUsed === 0 ? "success" : undefined} />
      </div>

      <section aria-labelledby={id} className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight">
          How the score adds up
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {label} {noun}
            </dt>
            <dd className="font-mono tabular-nums">{score.base.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Time bonus</dt>
            <dd className="font-mono tabular-nums text-success">+{score.timeBonus.toLocaleString()}</dd>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/#games" className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")}>
          <ArrowLeft /> Back to Games
        </Link>
        <SaveStatus state={saveState} noun="game" />
      </div>
    </Page>
  );
}
