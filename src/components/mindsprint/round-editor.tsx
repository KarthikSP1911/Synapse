"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Stepper, Slider, Switch } from "@/components/game/controls";
import { difficultyLevel, difficultyMultiplier } from "@/lib/mindsprint/config";
import { pointsFor } from "@/lib/mindsprint/scoring";
import { LIMITS, OPERATIONS, OPERATION_LABEL, OPERATION_SYMBOL, type Operation, type RoundConfig } from "@/lib/mindsprint/types";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function LevelBadge({ config, className }: { config: RoundConfig; className?: string }) {
  const level = difficultyLevel(config);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        level === "Easy" && "bg-success-soft text-success",
        level === "Medium" && "bg-warning-soft text-warning",
        (level === "Hard" || level === "Expert") && "bg-destructive-soft text-destructive",
        className
      )}
    >
      {level}
    </span>
  );
}

/** Every setting of one round. Changes are reported as a whole new configuration. */
export function RoundEditor({ config, onChange }: { config: RoundConfig; onChange: (next: RoundConfig) => void }) {
  const opsLabelId = useId();
  const set = <K extends keyof RoundConfig>(key: K, value: RoundConfig[K]) => onChange({ ...config, [key]: value });

  const toggleOperation = (op: Operation) => {
    if (config.operations.includes(op)) {
      // At least one operation has to stay on.
      if (config.operations.length > 1) set("operations", config.operations.filter((o) => o !== op));
    } else {
      set("operations", OPERATIONS.filter((o) => o === op || config.operations.includes(o)));
    }
  };

  const multiplier = difficultyMultiplier(config);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Stepper label="Numbers per round" hint="How many numbers flash" value={config.flashes} min={LIMITS.flashes.min} max={LIMITS.flashes.max} onChange={(v) => set("flashes", v)} />
        <Stepper label="Digits per number" hint="Size of each number" value={config.digits} min={LIMITS.digits.min} max={LIMITS.digits.max} onChange={(v) => set("digits", v)} />
      </div>

      <div>
        <p className="text-sm font-medium" id={opsLabelId}>
          Operations
        </p>
        <div role="group" aria-labelledby={opsLabelId} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OPERATIONS.map((op) => {
            const active = config.operations.includes(op);
            return (
              <button
                key={op}
                type="button"
                aria-pressed={active}
                aria-label={OPERATION_LABEL[op]}
                onClick={() => toggleOperation(op)}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-input hover:bg-accent hover:text-foreground"
                )}
              >
                <span aria-hidden className="font-mono text-lg leading-none">
                  {OPERATION_SYMBOL[op]}
                </span>
                <span className="text-[13px]">{OPERATION_LABEL[op]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Numbers are combined left to right, so 20 × 3 − 5 means (20 × 3) − 5 = 55.
          {config.operations.includes("divide") && " Divisions always come out exact."}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Switch
          label="Negative numbers"
          hint={config.allowNegative ? "Numbers and totals can go below zero" : "Totals never go below zero"}
          checked={config.allowNegative}
          onChange={(v) => set("allowNegative", v)}
        />
        <div className="space-y-4">
          <Switch
            label="Decimal numbers"
            hint={config.decimals ? "Numbers and totals can have decimals" : "Whole numbers only"}
            checked={config.decimals}
            onChange={(v) => set("decimals", v)}
          />
          {config.decimals && (
            <Stepper label="Decimal places" hint="At most, for any number or total" value={config.decimalPlaces} min={LIMITS.decimalPlaces.min} max={LIMITS.decimalPlaces.max} onChange={(v) => set("decimalPlaces", v)} />
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Slider
          label="Display time"
          hint="How long each number stays on screen"
          value={config.displayMs}
          min={LIMITS.displayMs.min}
          max={LIMITS.displayMs.max}
          step={LIMITS.displayMs.step}
          onChange={(v) => set("displayMs", v)}
          format={seconds}
        />
        <Slider
          label="Delay between numbers"
          hint="Blank time before the next number"
          value={config.gapMs}
          min={LIMITS.gapMs.min}
          max={LIMITS.gapMs.max}
          step={LIMITS.gapMs.step}
          onChange={(v) => set("gapMs", v)}
          format={seconds}
        />
      </div>

      <p className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <LevelBadge config={config} />
        <span>
          Worth <span className="font-mono font-semibold text-foreground">{pointsFor(multiplier)}</span> points when answered correctly
          <span className="font-mono"> (×{multiplier.toFixed(2)})</span>
        </span>
      </p>
    </div>
  );
}
