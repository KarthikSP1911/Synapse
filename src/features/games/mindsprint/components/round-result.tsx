import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calculation } from "@/features/games/mindsprint/components/calculation";
import { LevelBadge } from "@/features/games/mindsprint/components/round-editor";
import { displayNumber } from "@/features/games/mindsprint/lib/arithmetic";
import type { RoundOutcome } from "@/features/games/mindsprint/lib/scoring";
import type { PlayedRound } from "@/features/games/mindsprint/lib/types";

/** What you typed, as it is shown back: a true minus sign, or a dash when nothing usable was entered. */
export const shownAnswer = (round: PlayedRound, outcome: RoundOutcome): string => (round.answer === null || !outcome.answered ? "—" : displayNumber(round.answer.trim().replace(/^\+/, "")));

export function VerdictLabel({ outcome }: { outcome: RoundOutcome }) {
  if (outcome.correct) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success">
        <Check className="size-4" aria-hidden /> Correct
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", outcome.answered ? "text-destructive" : "text-muted-foreground")}>
      {outcome.answered ? <X className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      {outcome.answered ? "Incorrect" : "No answer"}
    </span>
  );
}

/** The answers, points and full working of one finished round. */
export function RoundResult({ round, outcome, className }: { round: PlayedRound; outcome: RoundOutcome; className?: string }) {
  return (
    <div className={cn("space-y-5", className)}>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background p-3.5">
          <dt className="text-xs text-muted-foreground">Your answer</dt>
          <dd
            className={cn(
              "mt-1 break-all font-mono text-2xl font-semibold tabular-nums",
              outcome.correct ? "text-success" : outcome.answered ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {shownAnswer(round, outcome)}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-background p-3.5">
          <dt className="text-xs text-muted-foreground">Correct answer</dt>
          <dd className="mt-1 break-all font-mono text-2xl font-semibold tabular-nums">{displayNumber(outcome.correctAnswer)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <VerdictLabel outcome={outcome} />
        <span className="flex items-center gap-2 text-muted-foreground">
          <LevelBadge config={round.config} />
          <span className="font-mono tabular-nums">
            <span className={cn("font-semibold", outcome.correct ? "text-success" : "text-foreground")}>+{outcome.points}</span> / {outcome.maxPoints} pts
          </span>
        </span>
      </div>
      <Calculation flashes={round.flashes} />
    </div>
  );
}
