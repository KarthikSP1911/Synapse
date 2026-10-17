"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Slider, Stepper } from "@/components/form/number-controls";
import { Switch } from "@/components/form/choice-controls";
import { HelpTip } from "@/components/form/help-tip";
import { PresetRow, SettingsStatus, SetupLayout, StartButton, type PresetOption } from "@/components/setup/setup-layout";
import { PRESETS, copyRound, presetOf, roundsOf, type PresetId } from "@/features/games/mindsprint/lib/config";
import { summarizeSetup } from "@/features/games/mindsprint/lib/summary";
import { defaultSetup, loadSetup, saveSetup } from "@/features/games/mindsprint/lib/storage";
import { sameValue } from "@/lib/same-value";
import { LIMITS, OPERATIONS, OPERATION_LABEL, OPERATION_SYMBOL, type Operation, type RoundConfig } from "@/features/games/mindsprint/lib/types";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const DIFFICULTY_OPTIONS: readonly PresetOption<PresetId | "custom">[] = [
  ...PRESETS.map((p) => ({ id: p.id, label: p.label, description: p.description })),
  { id: "custom", label: "Custom", description: "Set every number yourself. Changing any setting switches to Custom." },
];

export interface SetupProblem {
  message: string;
}

/**
 * One set of settings for the whole session, like Number Recall: pick a difficulty and start, or open Customize to change
 * anything yourself (which makes it Custom) and say how many rounds to play. Every round uses the same settings.
 */
export function SetupScreen({
  problem,
  starting,
  onStart,
}: {
  problem: SetupProblem | null;
  starting: boolean;
  onStart: (rounds: RoundConfig[]) => void;
}) {
  const [config, setConfig] = useState<RoundConfig>(() => defaultSetup().config);
  const [rounds, setRounds] = useState(() => defaultSetup().rounds);
  /** Custom was picked on purpose, even though the settings happen to equal a preset. */
  const [pickedCustom, setPickedCustom] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const opsLabelId = useId();

  // The remembered setup lives in localStorage, so it is read after mount to keep the server and first client render identical.
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = loadSetup();
      setConfig(saved.config);
      setRounds(saved.rounds);
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded) saveSetup({ config, rounds });
  }, [config, rounds, loaded]);

  const difficulty = pickedCustom ? "custom" : presetOf(config);
  const changed = !sameValue({ config, rounds }, defaultSetup());

  /** Any change to the settings themselves leaves the presets behind: the difficulty becomes whatever they now amount to. */
  const edit = (change: Partial<RoundConfig>) => {
    setConfig((current) => ({ ...current, ...change }));
    setPickedCustom(false);
  };

  const chooseDifficulty = (next: PresetId | "custom") => {
    if (next === "custom") {
      setPickedCustom(true);
      return;
    }
    // A preset replaces the settings of the numbers; how many rounds to play is the player's own choice and stays.
    const preset = PRESETS.find((p) => p.id === next);
    if (preset) setConfig(copyRound(preset.round));
    setPickedCustom(false);
  };

  const reset = () => {
    const fresh = defaultSetup();
    setConfig(fresh.config);
    setRounds(fresh.rounds);
    setPickedCustom(false);
  };

  const toggleOperation = (op: Operation) => {
    if (config.operations.includes(op)) {
      // At least one operation has to stay on.
      if (config.operations.length > 1) edit({ operations: config.operations.filter((o) => o !== op) });
    } else {
      edit({ operations: OPERATIONS.filter((o) => o === op || config.operations.includes(o)) });
    }
  };

  return (
    <SetupLayout
      status={<SettingsStatus changed={loaded && changed} onReset={reset} />}
      quick={<PresetRow label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={chooseDifficulty} />}
      customized={difficulty === "custom"}
      customize={
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            <Stepper label="Rounds" hint="How many to play" value={rounds} min={LIMITS.rounds.min} max={LIMITS.rounds.max} onChange={setRounds} />
            <Stepper label="Numbers per round" hint="How many numbers flash" value={config.flashes} min={LIMITS.flashes.min} max={LIMITS.flashes.max} onChange={(flashes) => edit({ flashes })} />
            <Stepper label="Digits per number" hint="Size of each number" value={config.digits} min={LIMITS.digits.min} max={LIMITS.digits.max} onChange={(digits) => edit({ digits })} />
          </div>

          <div>
            <div className="flex items-center gap-0.5">
              <p className="text-sm font-medium" id={opsLabelId}>
                Operations
              </p>
              <HelpTip label="Operations">
                Numbers are combined left to right, so 20 × 3 − 5 means (20 × 3) − 5 = 55.
                {config.operations.includes("divide") && " Divisions always come out exact."}
              </HelpTip>
            </div>
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
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Slider label="Display time" hint="How long each number stays on screen" value={config.displayMs} min={LIMITS.displayMs.min} max={LIMITS.displayMs.max} step={LIMITS.displayMs.step} onChange={(displayMs) => edit({ displayMs })} format={seconds} />
            <Slider label="Delay between numbers" hint="Blank time before the next number" value={config.gapMs} min={LIMITS.gapMs.min} max={LIMITS.gapMs.max} step={LIMITS.gapMs.step} onChange={(gapMs) => edit({ gapMs })} format={seconds} />
          </div>

          <div className="grid gap-5 border-t border-border pt-5">
            <Switch label="Negative numbers" hint={config.allowNegative ? "Numbers and totals can go below zero" : "Totals never go below zero"} checked={config.allowNegative} onChange={(allowNegative) => edit({ allowNegative })} />
            <Switch label="Decimal numbers" hint={config.decimals ? "Numbers and totals can have decimals" : "Whole numbers only"} checked={config.decimals} onChange={(decimals) => edit({ decimals })} />
            {/* Only there when decimals are on. */}
            {config.decimals && (
              <Stepper label="Decimal places" hint="At most, for any number or total" value={config.decimalPlaces} min={LIMITS.decimalPlaces.min} max={LIMITS.decimalPlaces.max} onChange={(decimalPlaces) => edit({ decimalPlaces })} />
            )}
          </div>
        </>
      }
      summary={summarizeSetup({ config, rounds })}
      problems={
        problem && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
            {problem.message}
          </p>
        )
      }
      action={<StartButton label="Start MindSprint" busy={starting} disabled={!loaded} onClick={() => onStart(roundsOf({ config, rounds }))} />}
    />
  );
}
