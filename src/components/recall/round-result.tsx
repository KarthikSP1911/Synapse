import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoundScore } from "@/lib/recall/scoring";
import type { PlayedRound } from "@/lib/recall/types";

/**
 * The original sequence above what the player entered, position by position. Right and wrong are shown with an
 * icon and a label as well as colour, and the items are always the original text ("07", never 7).
 */
export function SequenceComparison({ round, score, className }: { round: PlayedRound; score: RoundScore; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <ol aria-label="Sequence and your answer, by position" className="flex flex-wrap justify-center gap-2">
        {round.sequence.map((item, index) => {
          const right = score.positions[index];
          const entered = round.answer?.[index] ?? null;
          return (
            <li
              key={index}
              className={cn(
                "flex min-w-14 flex-col items-center gap-1 rounded-lg border px-2.5 py-2 font-mono tabular-nums",
                right ? "border-success/40 bg-success-soft" : "border-destructive/40 bg-destructive-soft"
              )}
            >
              <span className="text-[10px] text-muted-foreground">{index + 1}</span>
              <span className="text-xl font-semibold">{item}</span>
              <span className={cn("flex items-center gap-1 text-base", right ? "text-success" : "text-destructive")}>
                {right ? <Check className="size-3.5" aria-label="correct" /> : <X className="size-3.5" aria-label="incorrect" />}
                <span className={cn(!right && "line-through decoration-1")}>{entered ?? "—"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
          <dt className="text-xs text-muted-foreground">Original sequence</dt>
          <dd className="mt-0.5 break-words font-mono text-base font-semibold tabular-nums">{round.sequence.join(" ")}</dd>
        </div>
        <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
          <dt className="text-xs text-muted-foreground">Your answer</dt>
          <dd className="mt-0.5 break-words font-mono text-base font-semibold tabular-nums">{round.answer ? round.answer.join(" ") : "Skipped"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function PerfectLabel({ score, skipped }: { score: RoundScore; skipped: boolean }) {
  if (score.perfect) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success">
        <Check className="size-4" aria-hidden /> Perfect
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", skipped ? "text-muted-foreground" : "text-destructive")}>
      <X className="size-4" aria-hidden /> {skipped ? "Skipped" : `${score.correct} of ${score.total} in place`}
    </span>
  );
}
