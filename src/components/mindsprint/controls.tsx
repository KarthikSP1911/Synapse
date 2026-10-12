"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const stepButton = cn(
  "grid size-9 place-items-center rounded-md border border-border bg-background text-foreground transition-[background-color,transform] duration-150 pointer-coarse:size-11",
  "hover:bg-accent active:scale-95 disabled:pointer-events-none disabled:opacity-40",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
);

/** A labelled number with minus and plus buttons. */
export function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  format = String,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  format?: (value: number) => string;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className={stepButton} aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          <Minus className="size-4" />
        </button>
        <output aria-live="polite" className="w-10 text-center font-mono text-base font-semibold tabular-nums">
          {format(value)}
        </output>
        <button type="button" className={stepButton} aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** A labelled range input with the chosen value beside the label. */
export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  format: (value: number) => string;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-sm font-semibold tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** An on/off switch with a label. */
export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 pointer-coarse:h-7 pointer-coarse:w-12",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          checked ? "border-foreground bg-foreground" : "border-input bg-secondary"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-0.5 top-1/2 size-4.5 -translate-y-1/2 rounded-full transition-transform duration-150 pointer-coarse:size-5.5",
            checked ? "translate-x-5 bg-background pointer-coarse:translate-x-5" : "translate-x-0 bg-muted-foreground"
          )}
        />
      </button>
    </div>
  );
}
