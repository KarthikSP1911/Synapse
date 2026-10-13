"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Page, PageHeader, StatTile } from "@/components/layout/page-header";
import { RecordBanner, ResultActions, SaveStatus, type SaveState } from "@/features/games/shared/components/result-parts";
import { formatSeconds } from "@/features/games/shared/lib/format";
import { PerfectLabel, SequenceComparison } from "@/features/games/recall/components/round-result";
import { scoreSession } from "@/features/games/recall/lib/scoring";
import { ITEM_NAME, MODE_LABEL, type SessionData } from "@/features/games/recall/lib/types";

/** The end-of-session screen: totals, then every round with the original sequence next to the answer. */
export function SummaryScreen({
  data,
  previousBest,
  previousLongest,
  saveState,
  onReplay,
  onNewSetup,
}: {
  data: SessionData;
  /** Best score in this mode before this session. */
  previousBest: number;
  /** Longest sequence recalled perfectly in this mode before this session. */
  previousLongest: number;
  saveState: SaveState;
  onReplay: () => void;
  onNewSetup: () => void;
}) {
  const { config } = data;
  const scored = scoreSession(config, data.rounds);
  const newBest = scored.score > 0 && scored.score > previousBest;
  const newLongest = scored.longestRecalled > previousLongest;
  const [itemOne, itemMany] = ITEM_NAME[config.mode];

  return (
    <Page narrow>
      <PageHeader
        eyebrow={`Session complete · ${MODE_LABEL[config.mode]}`}
        title={`${scored.score.toLocaleString()} points`}
        description={`${scored.perfect} of ${scored.total} ${scored.total === 1 ? "round" : "rounds"} recalled perfectly.`}
        actions={<ResultActions onChange={onNewSetup} onReplay={onReplay} />}
      />

      {(newBest || newLongest) && (
        <div className="space-y-2" role="status">
          {newBest && <RecordBanner announce={false}>New best score{previousBest > 0 ? `, up from ${previousBest.toLocaleString()}` : ""}.</RecordBanner>}
          {newLongest && (
            <RecordBanner announce={false}>
              Longest recall so far: {scored.longestRecalled} {scored.longestRecalled === 1 ? itemOne : itemMany}.
            </RecordBanner>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Score" value={scored.score.toLocaleString()} hint={`out of ${scored.maxScore.toLocaleString()}`} />
        <StatTile label="Perfect rounds" value={`${scored.perfect}/${scored.total}`} tone={scored.accuracy >= 85 ? "success" : scored.accuracy >= 50 ? "warning" : "danger"} hint={`${scored.accuracy}% accuracy`} />
        <StatTile label="Longest recalled" value={scored.longestRecalled === 0 ? "—" : scored.longestRecalled} hint={scored.longestRecalled === 0 ? "no perfect round" : scored.longestRecalled === 1 ? itemOne : itemMany} />
        <StatTile label="In the right place" value={`${scored.positionAccuracy}%`} hint={scored.averageResponseMs === 0 ? undefined : `${formatSeconds(scored.averageResponseMs)} to answer`} />
      </div>

      <section aria-labelledby="nr-rounds-heading" className="space-y-3">
        <h2 id="nr-rounds-heading" className="text-lg font-semibold tracking-tight">
          Round by round
        </h2>
        <ul className="space-y-2">
          {data.rounds.map((round, index) => {
            const score = scored.rounds[index];
            return (
              <li key={index} className="rounded-xl border border-border bg-card shadow-card">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary font-mono text-xs font-semibold tabular-nums">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <PerfectLabel score={score} skipped={round.answer === null} />
                        <span className="font-mono text-xs text-muted-foreground">
                          {round.sequence.length} {round.sequence.length === 1 ? itemOne : itemMany}
                        </span>
                      </span>
                    </span>
                    <span className={cn("font-mono text-sm font-semibold tabular-nums", score.points > 0 ? "text-success" : "text-muted-foreground")}>+{score.points}</span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t border-border p-4">
                    <SequenceComparison round={round} score={score} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <SaveStatus state={saveState} noun="session" className="text-center" />
    </Page>
  );
}
