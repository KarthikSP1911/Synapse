"use client";

import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

const padButton = cn(
  "relative grid h-12 place-items-center rounded-lg border border-border bg-card text-2xl font-semibold shadow-card transition-[background-color,border-color,transform,opacity] duration-150 select-none touch-manipulation",
  "hover:border-input hover:bg-accent active:scale-95 disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "sm:h-14 lg:h-16"
);

/** Digits 1-9 and Erase in two rows of five; each digit shows how many are still to place. */
export function NumberPad({
  counts,
  notesMode,
  disabled,
  onDigit,
  onErase,
}: {
  /** How many of each digit are on the board, indexed by digit. */
  counts: readonly number[];
  notesMode: boolean;
  disabled: boolean;
  onDigit: (digit: number) => void;
  onErase: () => void;
}) {
  return (
    <div role="group" aria-label={notesMode ? "Number pad (pencil marks)" : "Number pad"} className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
        const left = Math.max(0, 9 - counts[d]);
        return (
          <button
            key={d}
            type="button"
            className={cn(padButton, notesMode && "text-xl text-muted-foreground")}
            disabled={disabled || (left === 0 && !notesMode)}
            aria-label={`${d}, ${left} left`}
            onClick={() => onDigit(d)}
          >
            {d}
            <span aria-hidden className="absolute right-1.5 top-1 font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
              {left}
            </span>
          </button>
        );
      })}
      <button type="button" className={cn(padButton, "text-muted-foreground")} disabled={disabled} aria-label="Erase" onClick={onErase}>
        <Eraser className="size-5" aria-hidden />
      </button>
    </div>
  );
}
