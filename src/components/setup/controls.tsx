"use client";

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
        "inline-flex h-9 items-center justify-center rounded-md border text-sm pointer-coarse:h-11 font-medium transition-colors select-none",
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

export function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-label={title}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Toggle list of exercise types. At least one must stay on. */
export function ExercisePicker({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string; description: string }[];
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
      {options.map(({ value, label, description }) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active ? "border-foreground bg-accent" : "border-border hover:border-input hover:bg-accent/60"
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
          </button>
        );
      })}
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  min: number;
  max: number;
  invalid?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        aria-invalid={invalid || undefined}
        aria-label={`${label} (${min} to ${max})`}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
        className={cn(
          "h-9 w-full rounded-md border bg-background px-3 text-base font-mono tabular-nums md:text-sm pointer-coarse:h-11 outline-none transition-colors",
          "focus:border-foreground focus:ring-4 focus:ring-ring/20",
          invalid ? "border-destructive" : "border-input"
        )}
      />
    </label>
  );
}
