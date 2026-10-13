"use client";

import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

const padButton = cn(
  "relative grid h-[3.25rem] place-items-center rounded-lg border border-border bg-card text-xl font-semibold shadow-card transition-[background-color,border-color,transform,opacity] duration-150 select-none touch-manipulation",
  "hover:border-input hover:bg-accent active:scale-95 disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "short:h-11 sm:h-14 lg:h-16 lg:text-2xl"
);

/**
 * Digits 1-9; each shows how many are still to place. On phones they are one row of nine (two rows of five held
 * sideways) and Erase sits with the other tools; from `lg` up Erase is the tenth key of two rows of five.
 */
export function NumberPad({
  counts,
  notesMode,
  disabled,
  onDigit,
  onErase,
  className,
}: {
  /** How many of each digit are on the board, indexed by digit. */
  counts: readonly number[];
  notesMode: boolean;
  disabled: boolean;
  onDigit: (digit: number) => void;
  onErase: () => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={notesMode ? "Number pad (pencil marks)" : "Number pad"} className={cn("grid grid-cols-9 gap-1 short:grid-cols-5 short:gap-2 sm:gap-2 lg:grid-cols-5", className)}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
        const left = Math.max(0, 9 - counts[d]);
        return (
          <button
            key={d}
            type="button"
            className={cn(padButton, notesMode && "text-lg text-muted-foreground lg:text-xl")}
            disabled={disabled || (left === 0 && !notesMode)}
            aria-label={`${d}, ${left} left`}
            onClick={() => onDigit(d)}
          >
            {d}
            <span aria-hidden className="absolute right-1 top-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground lg:right-1.5 lg:top-1">
              {left}
            </span>
          </button>
        );
      })}
      <button type="button" className={cn(padButton, "hidden text-muted-foreground lg:grid")} disabled={disabled} aria-label="Erase" onClick={onErase}>
        <Eraser className="size-5" aria-hidden />
      </button>
    </div>
  );
}
