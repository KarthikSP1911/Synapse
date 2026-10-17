"use client";

import { CircleAlert, CircleHelp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider, Stepper } from "@/components/form/number-controls";
import { Switch } from "@/components/form/choice-controls";
import { HelpTip } from "@/components/form/help-tip";
import { PresetRow, SettingsStatus, SetupLayout, StartButton, type PresetOption } from "@/components/setup/setup-layout";
import { minTrials, scoreableTrials, validateConfig, withN } from "@/features/games/nback/lib/config";
import { STREAM_KEY } from "@/features/games/nback/lib/keys";
import { MODE_PRESETS, modeOf, presetStreams, summarizeConfig, type ModePresetId } from "@/features/games/nback/lib/summary";
import { sameValue } from "@/lib/same-value";
import { activeStreams } from "@/features/games/nback/lib/config";
import { ADAPT_DOWN_PERCENT, ADAPT_UP_PERCENT, DEFAULT_CONFIG, LIMITS, LIVES, MIN_GAP_MS, MIN_SCOREABLE, STREAMS, STREAM_LABEL, defaultTrialCount, type NBackConfig, type StreamId } from "@/features/games/nback/lib/types";

const STREAM_HELP: Record<StreamId, string> = {
  position: "Which cell lights up.",
  color: "The color of the lit cell.",
  letter: "The letter inside it.",
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : ms % 100 === 0 ? 1 : 2)} s`;

const MODE_OPTIONS: readonly PresetOption<ModePresetId>[] = [
  ...MODE_PRESETS.map((p) => ({ id: p.id, label: p.label, detail: p.detail, description: p.description })),
  { id: "custom", label: "Custom", description: "Any other mix of streams. Choose them under Customize." },
];

function Group({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {help && <HelpTip label={title}>{help}</HelpTip>}
      </div>
      {children}
    </div>
  );
}

export function SetupScreen({
  config,
  onChange,
  onStart,
  onHowTo,
  starting,
}: {
  config: NBackConfig;
  onChange: (config: NBackConfig) => void;
  onStart: (config: NBackConfig) => void;
  onHowTo: () => void;
  starting: boolean;
}) {
  const { errors, warnings } = validateConfig(config);
  const canStart = errors.length === 0 && !starting;
  const streams = activeStreams(config);
  const mode = modeOf(config);
  const edit = (change: Partial<NBackConfig>) => onChange({ ...config, ...change });

  const toggle = (stream: StreamId) => {
    // One stream always stays on.
    if (config.streams[stream] && streams.length === 1) return;
    edit({ streams: { ...config.streams, [stream]: !config.streams[stream] } });
  };

  /** A new stimulus time also pulls the flash time up with it, so the stimulus never outlasts the flash. */
  const setStimulus = (stimulusMs: number) => edit({ stimulusMs, trialMs: Math.max(config.trialMs, stimulusMs + MIN_GAP_MS) });

  const startButton = <StartButton label="Start N-Back" disabled={!canStart} onClick={() => onStart(config)} />;

  return (
    <SetupLayout
      status={<SettingsStatus changed={!sameValue(config, DEFAULT_CONFIG)} onReset={() => onChange(DEFAULT_CONFIG)} />}
      quick={
        <div className="space-y-5">
          <PresetRow label="Mode" options={MODE_OPTIONS} value={mode} onChange={(next) => next !== "custom" && edit({ streams: presetStreams(next) })} />
          <Stepper
            label="n"
            hint={`Match against the stimulus ${config.n} ${config.n === 1 ? "flash" : "flashes"} back`}
            value={config.n}
            min={LIMITS.n.min}
            max={LIMITS.n.max}
            onChange={(n) => onChange(withN(config, n))}
          />
        </div>
      }
      customized={mode === "custom"}
      customize={
        <>
          <Group title="Streams" help="What you track. Turn on one for a single n-back, two for dual, three for triple.">
            <div role="group" aria-label="Streams" className="grid gap-2 sm:grid-cols-3">
              {STREAMS.map((stream) => {
                const on = config.streams[stream];
                return (
                  <button
                    key={stream}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(stream)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      on ? "border-foreground bg-card ring-1 ring-foreground" : "border-border bg-background hover:border-input hover:bg-accent/60"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-[15px] font-semibold tracking-tight">
                      {STREAM_LABEL[stream]}
                      <span aria-hidden className={cn("grid size-5 place-items-center rounded-[5px] border text-[11px] leading-none", on ? "border-foreground bg-foreground text-background" : "border-input")}>
                        {on ? "✓" : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{STREAM_HELP[stream]}</span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      Key <kbd className="rounded border border-border px-1 font-mono text-[11px]">{STREAM_KEY[stream]}</kbd>
                    </span>
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Board and stimuli">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Each of these only exists while its stream is on. */}
              {config.streams.position && <Stepper label="Board size" hint="Cells per side" value={config.grid} min={LIMITS.grid.min} max={LIMITS.grid.max} onChange={(grid) => edit({ grid })} format={(v) => `${v}×${v}`} />}
              {config.streams.color && <Stepper label="Colors" hint="How many in play" value={config.colors} min={LIMITS.colors.min} max={LIMITS.colors.max} onChange={(colors) => edit({ colors })} />}
              {config.streams.letter && <Stepper label="Letters" hint="How many in play" value={config.letters} min={LIMITS.letters.min} max={LIMITS.letters.max} onChange={(letters) => edit({ letters })} />}
            </div>
            {!config.streams.position && <p className="text-xs text-muted-foreground">With Position off the stimulus always appears in the middle cell.</p>}
          </Group>

          <Group title="Timing">
            <Switch
              label="Unlimited flashes"
              hint={`No set length. You play until you run out of ${LIVES} lives, or finish when you choose (after ${MIN_SCOREABLE} scored flashes).`}
              note="Finishing saves a completed session; Game Over does not."
              checked={config.unlimited}
              onChange={(unlimited) => edit({ unlimited })}
            />
            {!config.unlimited && (
              <>
                <Stepper
                  label="Flashes"
                  hint={`${scoreableTrials(config)} of them are scored; the first ${config.n} only set the pace`}
                  value={config.trials}
                  min={minTrials(config.n)}
                  max={LIMITS.trials.max}
                  onChange={(trials) => edit({ trials, autoTrials: trials === defaultTrialCount(config.n) ? config.autoTrials : false })}
                />
                <Switch label="Follow n" hint={`Use ${defaultTrialCount(config.n)} flashes (20 + n) and keep that as n changes`} checked={config.autoTrials} onChange={(autoTrials) => edit(autoTrials ? { autoTrials, trials: defaultTrialCount(config.n) } : { autoTrials })} />
              </>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <Slider
                label="Stimulus time"
                hint="How long the cell stays lit"
                value={config.stimulusMs}
                min={LIMITS.stimulusMs.min}
                max={Math.min(LIMITS.stimulusMs.max, LIMITS.trialMs.max - MIN_GAP_MS)}
                step={LIMITS.stimulusMs.step}
                onChange={setStimulus}
                format={seconds}
              />
              <Slider
                label="Time per flash"
                hint={`Lit time plus a gap of at least ${MIN_GAP_MS} ms; you can answer the whole time`}
                value={config.trialMs}
                min={Math.max(LIMITS.trialMs.min, config.stimulusMs + MIN_GAP_MS)}
                max={LIMITS.trialMs.max}
                step={LIMITS.trialMs.step}
                onChange={(trialMs) => edit({ trialMs })}
                format={seconds}
              />
            </div>
          </Group>

          <Group title="Difficulty and feedback">
            <Switch
              label="Adaptive n"
              hint={`After a session n goes up at ${ADAPT_UP_PERCENT}% accuracy or better and down below ${ADAPT_DOWN_PERCENT}%. A Game Over lowers it by one. It never changes during a session.`}
              checked={config.adaptive}
              onChange={(adaptive) => edit({ adaptive })}
            />
            <Switch
              label="Per-flash feedback"
              hint="Mark each stream right or wrong after every flash. Off, it plays like a test and everything shows at the end. Your hearts update either way."
              checked={config.feedback}
              onChange={(feedback) => edit({ feedback })}
            />
          </Group>
        </>
      }
      summary={summarizeConfig(config)}
      problems={
        (errors.length > 0 || warnings.length > 0) && (
          <ul className="space-y-2" aria-label="Settings problems">
            {errors.map((issue) => (
              <li key={issue.message} role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {issue.message}
              </li>
            ))}
            {warnings.map((issue) => (
              <li key={issue.message} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {issue.message}
              </li>
            ))}
          </ul>
        )
      }
      action={
        <>
          {startButton}
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onHowTo}>
            <CircleHelp /> How it works
          </Button>
        </>
      }
      mobileAction={startButton}
      note={`Run out of ${LIVES} lives and it's Game Over: no coins. Coins are paid only for a session played to the end.`}
    />
  );
}
