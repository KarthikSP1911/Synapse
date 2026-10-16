"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider, Stepper } from "@/components/form/number-controls";
import { Chip, Switch } from "@/components/form/choice-controls";
import { LevelBadge } from "@/features/games/mindsprint/components/level-badge";
import { PRESETS, copyRound, difficultyMultiplier, presetOf, roundsOf, type PresetId } from "@/features/games/mindsprint/lib/config";
import { formatApproxDuration } from "@/features/games/shared/lib/format";
import { pointsFor } from "@/features/games/mindsprint/lib/scoring";
import { defaultSetup, loadSetup, saveSetup } from "@/features/games/mindsprint/lib/storage";
import { COUNTDOWN_FROM, COUNT_STEP_MS, GO_MS } from "@/lib/timeline";
import { LIMITS, OPERATIONS, OPERATION_LABEL, OPERATION_SYMBOL, type Operation, type RoundConfig } from "@/features/games/mindsprint/lib/types";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const DIFFICULTY_LABEL: Record<PresetId | "custom", string> = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert", custom: "Custom" };
const DIFFICULTY_ORDER: (PresetId | "custom")[] = ["easy", "medium", "hard", "expert", "custom"];

/** Rough length of a session in seconds, for the summary: a countdown, the flashes and a few seconds to answer, for every round. */
function estimateSeconds(config: RoundConfig, rounds: number): number {
  const ANSWER_SECONDS = 6;
  return rounds * ((COUNTDOWN_FROM * COUNT_STEP_MS + GO_MS + config.flashes * (config.displayMs + config.gapMs)) / 1000 + ANSWER_SECONDS);
}

export interface SetupProblem {
  message: string;
}

/**
 * One set of settings for the whole session, like Number Recall: pick a difficulty or change anything yourself
 * (which makes it Custom), and say how many rounds to play. Every round uses the same settings.
 */
export function SetupScreen({
  sound,
  onSoundChange,
  problem,
  starting,
  onStart,
}: {
  sound: boolean;
  onSoundChange: (next: boolean) => void;
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
  const multiplier = difficultyMultiplier(config);
  const totalPoints = useMemo(() => rounds * pointsFor(multiplier), [rounds, multiplier]);

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

  const toggleOperation = (op: Operation) => {
    if (config.operations.includes(op)) {
      // At least one operation has to stay on.
      if (config.operations.length > 1) edit({ operations: config.operations.filter((o) => o !== op) });
    } else {
      edit({ operations: OPERATIONS.filter((o) => o === op || config.operations.includes(o)) });
    }
  };

  const activePreset = PRESETS.find((p) => p.id === difficulty);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="ms-settings">
          <h2 id="ms-settings" className="text-[15px] font-semibold tracking-tight">
            Settings
          </h2>

          <div className="mt-4">
            <p id="ms-difficulty" className="text-sm font-medium">
              Difficulty
            </p>
            <div role="group" aria-labelledby="ms-difficulty" className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {DIFFICULTY_ORDER.map((d) => (
                <Chip key={d} active={difficulty === d} onClick={() => chooseDifficulty(d)} className="px-1 text-[13px]">
                  {DIFFICULTY_LABEL[d]}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {activePreset ? `${activePreset.description} ` : ""}Easy to Expert set the numbers for every round. Changing any of them yourself switches to Custom.
            </p>
          </div>

          <div className="mt-6 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
            <Stepper label="Rounds" hint="How many to play" value={rounds} min={LIMITS.rounds.min} max={LIMITS.rounds.max} onChange={setRounds} />
            <Stepper label="Numbers per round" hint="How many numbers flash" value={config.flashes} min={LIMITS.flashes.min} max={LIMITS.flashes.max} onChange={(flashes) => edit({ flashes })} />
            <Stepper label="Digits per number" hint="Size of each number" value={config.digits} min={LIMITS.digits.min} max={LIMITS.digits.max} onChange={(digits) => edit({ digits })} />
          </div>

          <div className="mt-6">
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

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Slider
              label="Display time"
              hint="How long each number stays on screen"
              value={config.displayMs}
              min={LIMITS.displayMs.min}
              max={LIMITS.displayMs.max}
              step={LIMITS.displayMs.step}
              onChange={(displayMs) => edit({ displayMs })}
              format={seconds}
            />
            <Slider
              label="Delay between numbers"
              hint="Blank time before the next number"
              value={config.gapMs}
              min={LIMITS.gapMs.min}
              max={LIMITS.gapMs.max}
              step={LIMITS.gapMs.step}
              onChange={(gapMs) => edit({ gapMs })}
              format={seconds}
            />
          </div>

          <div className="mt-6 grid gap-5 border-t border-border pt-5">
            <Switch
              label="Negative numbers"
              hint={config.allowNegative ? "Numbers and totals can go below zero" : "Totals never go below zero"}
              checked={config.allowNegative}
              onChange={(allowNegative) => edit({ allowNegative })}
            />
            <Switch
              label="Decimal numbers"
              hint={config.decimals ? "Numbers and totals can have decimals" : "Whole numbers only"}
              checked={config.decimals}
              onChange={(decimals) => edit({ decimals })}
            />
            {config.decimals && (
              <Stepper label="Decimal places" hint="At most, for any number or total" value={config.decimalPlaces} min={LIMITS.decimalPlaces.min} max={LIMITS.decimalPlaces.max} onChange={(decimalPlaces) => edit({ decimalPlaces })} />
            )}
          </div>
        </section>
      </div>

      <aside className="rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20" aria-label="Session">
        <h2 className="text-[15px] font-semibold tracking-tight">Session</h2>
        <div className="mt-4">
          <Switch label="Sound" hint="Countdown, start and result cues" checked={sound} onChange={onSoundChange} />
        </div>

        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="flex items-center gap-2 font-medium">
              {DIFFICULTY_LABEL[difficulty]}
              {difficulty === "custom" && <LevelBadge config={config} />}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Rounds</dt>
            <dd className="font-mono font-medium tabular-nums">
              {rounds} × {config.flashes} numbers
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Top score</dt>
            <dd className="font-mono font-medium tabular-nums">{totalPoints.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Length</dt>
            <dd className="font-medium">{formatApproxDuration(estimateSeconds(config, rounds))}</dd>
          </div>
        </dl>

        {problem && (
          <p role="alert" className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {problem.message}
          </p>
        )}

        <Button size="xl" className="mt-5 w-full" disabled={starting || !loaded} onClick={() => onStart(roundsOf({ config, rounds }))}>
          {starting ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              Preparing…
            </>
          ) : (
            <>
              Start MindSprint
              <ArrowRight />
            </>
          )}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Numbers flash one at a time. Give the result once they are gone.</p>
      </aside>
    </div>
  );
}
