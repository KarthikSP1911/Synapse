"use client";

import { Slider, Stepper } from "@/components/form/number-controls";
import { Switch } from "@/components/form/choice-controls";
import { PresetRow, SettingsStatus, SetupLayout, StartButton, type PresetOption } from "@/components/setup/setup-layout";
import { configFor, defaultConfig, difficultyOf } from "@/features/games/recall/lib/config";
import { summarizeConfig } from "@/features/games/recall/lib/summary";
import { sameValue } from "@/lib/same-value";
import { DIGITS_PER_ITEM, ITEM_NAME, LIMITS, MODE_EXAMPLE, MODE_LABEL, RECALL_MODES, type Difficulty, type RecallConfig, type RecallMode } from "@/features/games/recall/lib/types";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const MODE_OPTIONS: readonly PresetOption<RecallMode>[] = RECALL_MODES.map((m) => ({
  id: m,
  label: MODE_LABEL[m],
  description: `${DIGITS_PER_ITEM[m] === 1 ? "Memorise a run of single digits" : "Memorise pairs from 00 to 99"}, like ${MODE_EXAMPLE[m]}. Each mode keeps its own settings and statistics.`,
}));

const DIFFICULTY_OPTIONS: readonly PresetOption<Difficulty>[] = [
  { id: "easy", label: "Easy", description: "A short sequence at a relaxed pace." },
  { id: "medium", label: "Medium", description: "A longer sequence at a steady pace." },
  { id: "hard", label: "Hard", description: "A long sequence, shown quickly." },
  { id: "custom", label: "Custom", description: "Set the length and timing yourself. Changing any of them switches to Custom." },
];

/** Pick a mode and a difficulty and start; Customize holds the length, timing and scoring choices. */
export function SetupScreen({
  mode,
  config,
  onMode,
  onChange,
  starting,
  onStart,
}: {
  mode: RecallMode;
  /** The settings for the chosen mode. */
  config: RecallConfig;
  onMode: (mode: RecallMode) => void;
  onChange: (config: RecallConfig) => void;
  starting: boolean;
  onStart: (config: RecallConfig) => void;
}) {
  const [itemOne] = ITEM_NAME[mode];
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
    <SetupLayout
      status={<SettingsStatus changed={!sameValue(config, defaultConfig(mode))} onReset={() => onChange(defaultConfig(mode))} />}
      quick={
        <div className="space-y-5">
          <PresetRow label="Mode" options={MODE_OPTIONS} value={mode} onChange={onMode} />
          <PresetRow label="Difficulty" options={DIFFICULTY_OPTIONS} value={config.difficulty} onChange={chooseDifficulty} />
        </div>
      }
      customized={config.difficulty === "custom"}
      customize={
        <>
          <div className="grid gap-6 sm:grid-cols-2">
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

          <div className="grid gap-6 sm:grid-cols-2">
            <Slider label="Display time" hint={`How long each ${itemOne} stays on screen`} value={config.displayMs} min={LIMITS.displayMs.min} max={LIMITS.displayMs.max} step={LIMITS.displayMs.step} onChange={(displayMs) => edit({ displayMs })} format={seconds} />
            <Slider label="Delay between items" hint="Blank time before the next one" value={config.gapMs} min={LIMITS.gapMs.min} max={LIMITS.gapMs.max} step={LIMITS.gapMs.step} onChange={(gapMs) => edit({ gapMs })} format={seconds} />
          </div>

          <div className="grid gap-5 border-t border-border pt-5">
            <Switch label="Progressive mode" hint={`Each perfect recall adds one more ${itemOne} to the next round; a miss repeats the same length`} checked={config.progressive} onChange={(progressive) => edit({ progressive })} />
            <Switch label="Partial credit" hint="Earn points for every item recalled in the right place, even when the whole sequence is not" checked={config.partialCredit} onChange={(partialCredit) => edit({ partialCredit })} />
          </div>
        </>
      }
      summary={`${MODE_LABEL[mode]}: ${summarizeConfig(config)}`}
      action={<StartButton label="Start Number Recall" busy={starting} busyLabel="Starting…" onClick={() => onStart(config)} />}
    />
  );
}
