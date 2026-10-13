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

export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  invalid,
  signed,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  min: number;
  max: number;
  invalid?: boolean;
  /** Allows a leading minus (for ranges that can go below zero). */
  signed?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        type="text"
        // Numeric keypads have no minus key on every platform, so a signed field uses the text keyboard.
        inputMode={signed ? "text" : "numeric"}
        value={value}
        aria-invalid={invalid || undefined}
        aria-label={`${label} (${min} to ${max})`}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(signed ? `${/^[-−]/.test(e.target.value) ? "-" : ""}${digits.slice(0, 3)}` : digits.slice(0, 5));
        }}
        className={cn(
          "h-9 w-full rounded-md border bg-background px-3 text-base font-mono tabular-nums md:text-sm pointer-coarse:h-11 outline-none transition-colors",
          "focus:border-foreground focus:ring-4 focus:ring-ring/20",
          invalid ? "border-destructive" : "border-input"
        )}
      />
    </label>
  );
}
