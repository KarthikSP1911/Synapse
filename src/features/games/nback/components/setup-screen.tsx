"use client";

import { ArrowRight, CircleAlert, CircleHelp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider, Stepper } from "@/components/form/number-controls";
import { Switch } from "@/components/form/choice-controls";
import { ECONOMY } from "@/features/rewards/lib/economy";
import { formatApproxDuration } from "@/features/games/shared/lib/format";
import { activeStreams, minTrials, scoreableTrials, streamMode, validateConfig, withN } from "@/features/games/nback/lib/config";
import { difficultyOf } from "@/features/games/nback/lib/difficulty";
import { STREAM_KEY } from "@/features/games/nback/lib/keys";
import { ADAPT_DOWN_PERCENT, ADAPT_UP_PERCENT, LIMITS, LIVES, MIN_GAP_MS, MIN_SCOREABLE, MODE_LABEL, STREAMS, STREAM_LABEL, defaultTrialCount, type NBackConfig, type StreamId } from "@/features/games/nback/lib/types";

const STREAM_HELP: Record<StreamId, string> = {
  position: "Which cell lights up.",
  color: "The color of the lit cell.",
  letter: "The letter inside it.",
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : ms % 100 === 0 ? 1 : 2)} s`;

const DIFFICULTY_NAME = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" } as const;

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby={id}>
      <h2 id={id} className="text-[15px] font-semibold tracking-tight">
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

/** A control that only means something while its stream is on. */
function WhenOn({ on, reason, children }: { on: boolean; reason: string; children: React.ReactNode }) {
  return (
    <div className={cn(!on && "opacity-50")} inert={!on} title={on ? undefined : reason}>
      {children}
      {!on && <p className="mt-1 text-xs text-muted-foreground">{reason}</p>}
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
  const edit = (change: Partial<NBackConfig>) => onChange({ ...config, ...change });
  const reward = ECONOMY.puzzle[difficultyOf(config)];

  const toggle = (stream: StreamId) => {
    // One stream always stays on.
    if (config.streams[stream] && streams.length === 1) return;
    edit({ streams: { ...config.streams, [stream]: !config.streams[stream] } });
  };

  /** A new stimulus time also pulls the flash time up with it, so the stimulus never outlasts the flash. */
  const setStimulus = (stimulusMs: number) => edit({ stimulusMs, trialMs: Math.max(config.trialMs, stimulusMs + MIN_GAP_MS) });

  const startButton = (
    <Button size="xl" className="w-full" disabled={!canStart} onClick={() => onStart(config)}>
      Start N-Back
      <ArrowRight />
    </Button>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Section id="nb-streams" title="Streams" hint="What you track. Turn on one for a single n-back, two for dual, three for triple.">
          <div role="group" aria-label="Streams" className="mt-4 grid gap-2 sm:grid-cols-3">
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
        </Section>

        <Section id="nb-level" title="Level">
          <div className="mt-4 grid gap-6">
            <Stepper
              label="n"
              hint={`Match against the stimulus ${config.n} ${config.n === 1 ? "flash" : "flashes"} back`}
              value={config.n}
              min={LIMITS.n.min}
              max={LIMITS.n.max}
              onChange={(n) => onChange(withN(config, n))}
            />
            <Switch
              label="Adaptive n"
              hint={`After a session n goes up at ${ADAPT_UP_PERCENT}% accuracy or better and down below ${ADAPT_DOWN_PERCENT}%. A Game Over lowers it by one. It never changes during a session.`}
              checked={config.adaptive}
              onChange={(adaptive) => edit({ adaptive })}
            />
          </div>
        </Section>

        <Section id="nb-board" title="Board and stimuli">
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <Stepper label="Board size" hint="Cells per side" value={config.grid} min={LIMITS.grid.min} max={LIMITS.grid.max} onChange={(grid) => edit({ grid })} format={(v) => `${v}×${v}`} />
            <WhenOn on={config.streams.color} reason="Turn on Color to use colors.">
              <Stepper label="Colors" hint="How many in play" value={config.colors} min={LIMITS.colors.min} max={LIMITS.colors.max} onChange={(colors) => edit({ colors })} />
            </WhenOn>
            <WhenOn on={config.streams.letter} reason="Turn on Letter to use letters.">
              <Stepper label="Letters" hint="How many in play" value={config.letters} min={LIMITS.letters.min} max={LIMITS.letters.max} onChange={(letters) => edit({ letters })} />
            </WhenOn>
          </div>
          {!config.streams.position && <p className="mt-4 text-xs text-muted-foreground">With Position off the stimulus always appears in the middle cell.</p>}
        </Section>

        <Section id="nb-timing" title="Timing">
          <div className="mt-4 grid gap-6">
            <Switch
              label="Unlimited flashes"
              hint={`No set length. You play until you run out of ${LIVES} lives, or finish when you choose (after ${MIN_SCOREABLE} scored flashes). Finishing saves a completed session; Game Over does not.`}
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
          </div>
        </Section>

        <Section id="nb-feedback" title="Feedback">
          <div className="mt-4">
            <Switch
              label="Per-flash feedback"
              hint="Mark each stream right or wrong after every flash. Off, it plays like a test and everything shows at the end. Your hearts update either way."
              checked={config.feedback}
              onChange={(feedback) => edit({ feedback })}
            />
          </div>
        </Section>

        {(errors.length > 0 || warnings.length > 0) && (
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
        )}

        {/* On phones the Start button stays on screen above the tab bar. */}
        <div className="sdk-start-bar -mx-5 border-t border-border bg-background/90 px-5 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">{startButton}</div>
      </div>

      <aside className="rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20" aria-label="Session">
        <h2 className="text-[15px] font-semibold tracking-tight">Session</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Mode" value={`${MODE_LABEL[streamMode(config)]} · ${streams.map((s) => STREAM_LABEL[s]).join(" + ")}`} />
          <Row label="n" value={`${config.n}${config.adaptive ? " (adaptive)" : ""}`} />
          <Row label="Board" value={`${config.grid}×${config.grid}`} />
          <Row label="Flashes" value={config.unlimited ? "Unlimited" : `${config.trials} (${scoreableTrials(config)} scored)`} />
          <Row label="Length" value={config.unlimited ? "Until Game Over or you finish" : formatApproxDuration((config.trials * config.trialMs) / 1000 + 3)} />
          <Row label="Lives" value={`${LIVES}`} />
          <Row label="Reward" value={`${reward} coins · ${DIFFICULTY_NAME[difficultyOf(config)]}`} />
        </dl>
        <div className="mt-5 hidden lg:block">{startButton}</div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Run out of {LIVES} lives and the session ends. Coins are paid only for a session played to the end{config.unlimited ? " (finished by you)" : ""}.
        </p>
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onHowTo}>
          <CircleHelp /> How it works
        </Button>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
