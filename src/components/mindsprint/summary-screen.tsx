"use client";

import { ChevronDown, RotateCcw, SlidersHorizontal, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Page, PageHeader, StatTile } from "@/components/page-header";
import { LevelBadge } from "@/components/mindsprint/round-editor";
import { RoundResult, VerdictLabel, shownAnswer } from "@/components/mindsprint/round-result";
import { displayNumber } from "@/lib/mindsprint/arithmetic";
import { scoreSession } from "@/lib/mindsprint/scoring";
import type { SessionData } from "@/lib/mindsprint/types";

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export type SaveState = "saved" | "failed";

/** The end-of-session screen: totals, then every round with its working. */
export function SummaryScreen({
  data,
  previousBest,
  saveState,
  onReplay,
  onNewSetup,
}: {
  data: SessionData;
  /** The best score before this session, to say when it is beaten. */
  previousBest: number;
  saveState: SaveState;
  onReplay: () => void;
  onNewSetup: () => void;
}) {
  const scored = scoreSession(data.rounds);
  const newBest = scored.score > 0 && scored.score > previousBest;

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Session complete"
        title={`${scored.score.toLocaleString()} points`}
        description={`${scored.correct} of ${scored.total} ${scored.total === 1 ? "round" : "rounds"} correct.`}
        actions={
          <>
            <Button variant="outline" onClick={onNewSetup}>
              <SlidersHorizontal /> Change setup
            </Button>
            <Button onClick={onReplay} autoFocus>
              <RotateCcw /> Play again
            </Button>
          </>
        }
      />

      {newBest && (
        <p className="animate-pop flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success" role="status">
          <Trophy className="size-4" aria-hidden />
          New best score{previousBest > 0 ? `, up from ${previousBest.toLocaleString()}` : ""}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Score" value={scored.score.toLocaleString()} hint={`out of ${scored.maxScore.toLocaleString()}`} />
        <StatTile label="Correct" value={`${scored.correct}/${scored.total}`} />
        <StatTile label="Accuracy" value={`${scored.accuracy}%`} tone={scored.accuracy >= 85 ? "success" : scored.accuracy >= 60 ? "warning" : "danger"} />
        <StatTile label="Avg response" value={scored.averageResponseMs === 0 ? "—" : formatSeconds(scored.averageResponseMs)} hint="to type an answer" />
      </div>

      <section aria-labelledby="ms-rounds-heading" className="space-y-3">
        <h2 id="ms-rounds-heading" className="text-lg font-semibold tracking-tight">
          Round by round
        </h2>
        <ul className="space-y-2">
          {data.rounds.map((round, index) => {
            const outcome = scored.rounds[index];
            return (
              <li key={index} className="rounded-xl border border-border bg-card shadow-card">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary font-mono text-xs font-semibold tabular-nums">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <VerdictLabel outcome={outcome} />
                        <LevelBadge config={round.config} />
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground">
                        You: {shownAnswer(round, outcome)} · Answer: {displayNumber(outcome.correctAnswer)}
                      </span>
                    </span>
                    <span className={cn("font-mono text-sm font-semibold tabular-nums", outcome.correct ? "text-success" : "text-muted-foreground")}>+{outcome.points}</span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t border-border p-4">
                    <RoundResult round={round} outcome={outcome} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <p role="status" className={cn("text-center text-xs", saveState === "failed" ? "text-warning" : "text-muted-foreground")}>
        {saveState === "saved" ? "Saved to your progress." : "This session could not be saved: the browser's storage is full or blocked."}
      </p>
    </Page>
  );
}
