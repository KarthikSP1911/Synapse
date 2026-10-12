import { cn } from "@/lib/utils";
import { displayCalculation, displayNumber, displayOperand, evaluateSequence } from "@/lib/mindsprint/arithmetic";
import { OPERATION_SYMBOL, type Flash } from "@/lib/mindsprint/types";

/**
 * Every number that was flashed with its operator, in the order shown, the running total after each step, and the
 * whole calculation on one line. Built from the same sequence that was played and scored.
 */
export function Calculation({ flashes, className }: { flashes: readonly Flash[]; className?: string }) {
  const result = evaluateSequence(flashes);
  if (!result.ok) return <p className="text-sm text-destructive">This round could not be shown: {result.reason}</p>;

  return (
    <div className={cn("space-y-3", className)}>
      <ol aria-label="Numbers in the order shown" className="divide-y divide-border rounded-lg border border-border bg-background font-mono text-[15px] tabular-nums">
        {result.steps.map((step, index) => (
          <li key={index} className="flex items-center justify-between gap-4 px-3.5 py-2">
            <span className="flex items-center gap-2">
              <span className="w-5 text-right text-xs text-muted-foreground">{index + 1}</span>
              <span className="w-5 text-center text-muted-foreground" aria-label={step.op === null ? "start" : step.op}>
                {step.op === null ? "" : OPERATION_SYMBOL[step.op]}
              </span>
              <span className="font-semibold">{step.op === null ? displayNumber(step.value) : displayOperand(step.value)}</span>
            </span>
            <span className="text-muted-foreground">
              <span aria-hidden>= </span>
              <span className={cn(index === result.steps.length - 1 && "font-semibold text-foreground")}>{displayNumber(step.total)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="break-words font-mono text-sm tabular-nums text-muted-foreground">{displayCalculation(flashes, result.answer)}</p>
    </div>
  );
}
