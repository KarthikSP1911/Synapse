"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { DIGITS_PER_ITEM, type RecallMode } from "@/features/games/recall/lib/types";

/**
 * One box per item of the sequence. A box holds exactly one digit (single mode) or two (pair mode), as text, so
 * "07" stays "07". All editing is reported to the parent, which owns the values; this component only draws the
 * boxes and moves the keyboard focus to the active one.
 *
 * With `readOnly` (touch devices, where the on-screen number pad types instead of the OS keyboard) the boxes can
 * still be tapped to choose which one the pad fills.
 */
export function EntryBoxes({
  mode,
  entries,
  active,
  invalid,
  readOnly,
  onActive,
  onEdit,
  onPaste,
  onBackspace,
  onSubmit,
}: {
  mode: RecallMode;
  entries: readonly string[];
  active: number;
  /** Boxes to mark as incomplete after a failed submit. */
  invalid: readonly number[];
  readOnly: boolean;
  onActive: (index: number) => void;
  /** Typed text for a box, not yet cleaned. */
  onEdit: (index: number, value: string) => void;
  onPaste: (index: number, text: string) => void;
  /** Backspace in a box that is already empty. */
  onBackspace: (index: number) => void;
  onSubmit: () => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const width = DIGITS_PER_ITEM[mode];

  // Keyboard focus follows the active box (on touch devices the pad is used, so no focus is needed).
  useEffect(() => {
    if (!readOnly) refs.current[active]?.focus();
  }, [active, readOnly]);

  return (
    <div role="group" aria-label={`Your answer: ${entries.length} ${width === 1 ? "digits" : "two-digit numbers"}, in order`} className="flex flex-wrap justify-center gap-2 sm:gap-3">
      {entries.map((value, index) => {
        const bad = invalid.includes(index);
        return (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode={readOnly ? "none" : "numeric"}
            pattern="[0-9]*"
            readOnly={readOnly}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            placeholder={"•".repeat(width)}
            aria-label={`${index + 1} of ${entries.length}`}
            aria-invalid={bad || undefined}
            onFocus={() => onActive(index)}
            onChange={(e) => onEdit(index, e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              onPaste(index, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              } else if (e.key === "Backspace" && value === "") {
                e.preventDefault();
                onBackspace(index);
              } else if (e.key === "ArrowLeft" && index > 0) {
                e.preventDefault();
                onActive(index - 1);
              } else if (e.key === "ArrowRight" && index < entries.length - 1) {
                e.preventDefault();
                onActive(index + 1);
              }
            }}
            className={cn(
              "h-14 rounded-lg border bg-card text-center font-mono text-3xl font-semibold tabular-nums shadow-card outline-none transition-colors sm:h-16",
              "placeholder:text-muted-foreground/30 focus:border-foreground focus:ring-4 focus:ring-ring/20",
              width === 1 ? "w-11 sm:w-14" : "w-16 sm:w-20",
              readOnly && index === active && "border-foreground ring-4 ring-ring/20",
              bad ? "border-destructive" : readOnly && index === active ? "" : "border-input"
            )}
          />
        );
      })}
    </div>
  );
}
