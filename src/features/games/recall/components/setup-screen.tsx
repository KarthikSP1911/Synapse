"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider, Stepper, Switch } from "@/components/form/game-controls";
import { Chip } from "@/components/form/setup-controls";
import { configFor, difficultyOf } from "@/features/games/recall/lib/config";
import { COUNT_STEP_MS, GO_MS } from "@/features/games/mindsprint/lib/timeline";
import { DIGITS_PER_ITEM, ITEM_NAME, LIMITS, MODE_EXAMPLE, MODE_LABEL, RECALL_MODES, type Difficulty, type RecallConfig, type RecallMode } from "@/features/games/recall/lib/types";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", custom: "Custom" };
const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard", "custom"];

/** Rough length of a session in seconds: countdown, items and a few seconds to type each round. */
function estimateSeconds(config: RecallConfig): number {
  const ANSWER_SECONDS = 8;
  return config.rounds * ((config.countdown * COUNT_STEP_MS + GO_MS + config.length * (config.displayMs + config.gapMs)) / 1000 + ANSWER_SECONDS);
}

const formatDuration = (s: number) => (s < 90 ? `about ${Math.round(s / 5) * 5} sec` : `about ${Math.round(s / 60)} min`);

export function SetupScreen({
  mode,
  config,
  onMode,
  onChange,
  sound,
  onSoundChange,
  starting,
  onStart,
}: {
  mode: RecallMode;
  /** The settings for the chosen mode. */
  config: RecallConfig;
  onMode: (mode: RecallMode) => void;
  onChange: (config: RecallConfig) => void;
  sound: boolean;
  onSoundChange: (next: boolean) => void;
  starting: boolean;
  onStart: (config: RecallConfig) => void;
}) {
  const [itemOne, itemMany] = ITEM_NAME[mode];
  const itemLabel = mode === "single" ? "Digits" : "Numbers";

  /** Applies a change to a timing or length setting; the difficulty becomes whatever the values now amount to. */
  const edit = (change: Partial<RecallConfig>) => {
    const next = { ...config, ...change };
    // Rounds, progression and credit are not part of a difficulty, so changing them leaves it alone.
    const shapesDifficulty = "length" in change || "displayMs" in change || "gapMs" in change || "countdown" in change;
    onChange(shapesDifficulty ? { ...next, difficulty: difficultyOf(next) } : next);
  };

  const chooseDifficulty = (difficulty: Difficulty) => {
    // A preset replaces length and timing; the choices about rounds, progression and credit are kept. Custom keeps the current values.
    if (difficulty === "custom") onChange({ ...config, difficulty });
    else onChange(configFor(mode, difficulty, { rounds: config.rounds, progressive: config.progressive, partialCredit: config.partialCredit }));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="nr-mode">
          <h2 id="nr-mode" className="text-[15px] font-semibold tracking-tight">
            Mode
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Each mode keeps its own settings and statistics.</p>
          <div role="group" aria-label="Mode" className="mt-4 grid gap-2 sm:grid-cols-2">
            {RECALL_MODES.map((m) => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onMode(m)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "border-foreground bg-card ring-1 ring-foreground" : "border-border bg-background hover:border-input hover:bg-accent/60"
                  )}
                >
                  <span className="text-[15px] font-semibold tracking-tight">{MODE_LABEL[m]}</span>
                  <span className="text-xs text-muted-foreground">{DIGITS_PER_ITEM[m] === 1 ? "Memorise a run of single digits." : "Memorise pairs from 00 to 99."}</span>
                  <span className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{MODE_EXAMPLE[m]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="nr-settings">
          <h2 id="nr-settings" className="text-[15px] font-semibold tracking-tight">
            Settings
          </h2>

          <div className="mt-4">
            <p id="nr-difficulty" className="text-sm font-medium">
              Difficulty
            </p>
            <div role="group" aria-labelledby="nr-difficulty" className="mt-2 grid grid-cols-4 gap-2">
              {DIFFICULTY_ORDER.map((d) => (
                <Chip key={d} active={config.difficulty === d} onClick={() => chooseDifficulty(d)} className="px-1 text-[13px]">
                  {DIFFICULTY_LABEL[d]}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Easy, Medium and Hard set the length and timing for this mode. Changing any of them yourself switches to Custom.</p>
          </div>

          <div className="mt-6 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
            <Stepper label="Rounds" value={config.rounds} min={LIMITS.rounds.min} max={LIMITS.rounds.max} onChange={(rounds) => edit({ rounds })} />
            <Stepper
              label={`${itemLabel} per round`}
              hint={mode === "single" ? "How many digits flash" : "How many two-digit numbers flash"}
              value={config.length}
              min={LIMITS.length.min}
              max={LIMITS.length.max}
              onChange={(length) => edit({ length })}
            />
            <Stepper label="Countdown" hint="Seconds before each round" value={config.countdown} min={LIMITS.countdown.min} max={LIMITS.countdown.max} onChange={(countdown) => edit({ countdown })} format={(v) => `${v}s`} />
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Slider
              label="Display time"
              hint={`How long each ${itemOne} stays on screen`}
              value={config.displayMs}
              min={LIMITS.displayMs.min}
              max={LIMITS.displayMs.max}
              step={LIMITS.displayMs.step}
              onChange={(displayMs) => edit({ displayMs })}
              format={seconds}
            />
            <Slider
              label="Delay between items"
              hint="Blank time before the next one"
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
              label="Progressive mode"
              hint={`Each perfect recall adds one more ${itemOne} to the next round; a miss repeats the same length`}
              checked={config.progressive}
              onChange={(progressive) => edit({ progressive })}
            />
            <Switch
              label="Partial credit"
              hint="Earn points for every item recalled in the right place, even when the whole sequence is not"
              checked={config.partialCredit}
              onChange={(partialCredit) => edit({ partialCredit })}
            />
          </div>
        </section>
      </div>

      <aside className="rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20" aria-label="Session">
        <h2 className="text-[15px] font-semibold tracking-tight">Session</h2>
        <div className="mt-4">
          <Switch label="Sound" hint="Countdown, start and result cues" checked={sound} onChange={onSoundChange} />
        </div>

        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="font-medium">{MODE_LABEL[mode]}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="font-medium">{DIFFICULTY_LABEL[config.difficulty]}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Rounds</dt>
            <dd className="font-mono font-medium tabular-nums">
              {config.rounds} × {config.length}
              {config.progressive ? "+" : ""} {config.length === 1 ? itemOne : itemMany}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Length</dt>
            <dd className="font-medium">{formatDuration(estimateSeconds(config))}</dd>
          </div>
        </dl>

        <Button size="xl" className="mt-5 w-full" disabled={starting} onClick={() => onStart(config)}>
          Start Number Recall
          <ArrowRight />
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Watch the sequence, then type it back in the same order.</p>
      </aside>
    </div>
  );
}
