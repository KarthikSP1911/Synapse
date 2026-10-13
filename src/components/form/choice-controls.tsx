"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function Chip({
  active,
  onClick,
  children,
  className,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-md border text-sm pointer-coarse:h-11 font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:border-input hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Toggle list of exercise types. At least one must stay on. */
export function ExercisePicker({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string; description: string; /** Why this one cannot be switched on right now. */ disabledReason?: string | null }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      if (selected.length > 1) onChange(selected.filter((v) => v !== value));
    } else {
      onChange(options.map((o) => o.value).filter((v) => v === value || selected.includes(v)));
    }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Exercise types">
      {options.map(({ value, label, description, disabledReason }) => {
        const unavailable = Boolean(disabledReason);
        const active = !unavailable && selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={unavailable}
            onClick={() => toggle(value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              unavailable && "cursor-not-allowed border-dashed opacity-60 active:scale-100",
              !unavailable && (active ? "border-foreground bg-accent" : "border-border hover:border-input hover:bg-accent/60")
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden
                className={cn(
                  "grid size-4 place-items-center rounded-[4px] border text-[10px] leading-none",
                  active ? "border-foreground bg-foreground text-background" : "border-input"
                )}
              >
                {active ? "✓" : ""}
              </span>
              {label}
            </span>
            <span className="pl-6 font-mono text-xs text-muted-foreground">{description}</span>
            {disabledReason && <span className="pl-6 text-xs text-muted-foreground">{disabledReason}</span>}
          </button>
        );
      })}
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
