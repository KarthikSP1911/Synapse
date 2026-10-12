"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Stepper, Switch } from "@/components/game/controls";
import { LevelBadge, RoundEditor } from "@/components/mindsprint/round-editor";
import { PRESETS, describeRound, difficultyMultiplier, type Preset } from "@/lib/mindsprint/config";
import { pointsFor } from "@/lib/mindsprint/scoring";
import { defaultSetup, loadSetup, saveSetup } from "@/lib/mindsprint/storage";
import { COUNTDOWN_FROM, COUNT_STEP_MS, GO_MS } from "@/lib/mindsprint/timeline";
import { LIMITS, type RoundConfig } from "@/lib/mindsprint/types";

interface Draft {
  id: number;
  config: RoundConfig;
}

/** Ids only have to be unique among the rounds on screen, so a counter outside the component is enough. */
let nextDraftId = 1;
const makeDrafts = (configs: readonly RoundConfig[]): Draft[] => configs.map((config) => ({ id: nextDraftId++, config: copyOf(config) }));

const copyOf = (config: RoundConfig): RoundConfig => ({ ...config, operations: [...config.operations] });

/** Rough length of a session in seconds, for the summary: countdown, flashes and a few seconds to answer each round. */
function estimateSeconds(rounds: readonly RoundConfig[]): number {
  const ANSWER_SECONDS = 6;
  return rounds.reduce((sum, r) => sum + (COUNTDOWN_FROM * COUNT_STEP_MS + GO_MS + r.flashes * (r.displayMs + r.gapMs)) / 1000 + ANSWER_SECONDS, 0);
}

const formatDuration = (seconds: number) => (seconds < 90 ? `about ${Math.round(seconds / 5) * 5} sec` : `about ${Math.round(seconds / 60)} min`);

export interface SetupProblem {
  message: string;
  /** Zero-based index of the round to open, when the problem is in one round. */
  round?: number;
}

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
  const [drafts, setDrafts] = useState<Draft[]>(() => makeDrafts(defaultSetup()));
  const [openId, setOpenId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The remembered setup lives in localStorage, so it is read after mount to keep the server and first client render identical.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDrafts(makeDrafts(loadSetup()));
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loaded) saveSetup(drafts.map((d) => d.config));
  }, [drafts, loaded]);

  // A round the generator rejected is opened so the problem can be fixed in place (state adjusted while rendering, as React advises for reacting to a changed prop).
  const [seenProblem, setSeenProblem] = useState<SetupProblem | null>(null);
  if (problem !== seenProblem) {
    setSeenProblem(problem);
    const target = problem?.round === undefined ? undefined : drafts[problem.round];
    if (target) setOpenId(target.id);
  }

  const configs = useMemo(() => drafts.map((d) => d.config), [drafts]);
  const totalPoints = useMemo(() => configs.reduce((sum, c) => sum + pointsFor(difficultyMultiplier(c)), 0), [configs]);

  const update = (id: number, config: RoundConfig) => setDrafts((list) => list.map((d) => (d.id === id ? { ...d, config } : d)));

  const duplicate = (index: number) =>
    setDrafts((list) => {
      if (list.length >= LIMITS.rounds.max) return list;
      const copy: Draft = { id: nextDraftId++, config: copyOf(list[index].config) };
      return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
    });

  const remove = (id: number) => setDrafts((list) => (list.length > LIMITS.rounds.min ? list.filter((d) => d.id !== id) : list));

  const move = (index: number, by: -1 | 1) =>
    setDrafts((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const setRoundCount = (count: number) =>
    setDrafts((list) => {
      if (count < list.length) return list.slice(0, count);
      const extra = Array.from({ length: count - list.length }, () => ({ id: nextDraftId++, config: copyOf(list[list.length - 1].config) }));
      return [...list, ...extra];
    });

  const applyPreset = (preset: Preset) => {
    setDrafts(makeDrafts(Array.from({ length: preset.rounds }, () => preset.round)));
    setOpenId(null);
  };

  const applyToAll = (config: RoundConfig) => setDrafts((list) => list.map((d) => ({ ...d, config: copyOf(config) })));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="ms-presets">
          <h2 id="ms-presets" className="text-[15px] font-semibold tracking-tight">
            Start from a preset
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Replaces all rounds. You can still change every round afterwards.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border border-border bg-background p-3 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
                  "hover:border-input hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{preset.label}</span>
                  <LevelBadge config={preset.round} />
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{preset.description}</span>
                <span className="mt-1 font-mono text-[11px] text-muted-foreground">{preset.rounds} rounds</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="ms-rounds">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="ms-rounds" className="text-[15px] font-semibold tracking-tight">
                Rounds
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Each round has its own settings. Open one to edit it.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={drafts.length >= LIMITS.rounds.max}
              onClick={() => {
                const last = drafts[drafts.length - 1];
                const added: Draft = { id: nextDraftId++, config: copyOf(last.config) };
                setDrafts((list) => [...list, added]);
                setOpenId(added.id);
              }}
            >
              <Plus /> Add round
            </Button>
          </div>

          <ol className="mt-4 space-y-2">
            {drafts.map((draft, index) => {
              const open = openId === draft.id;
              const failing = problem?.round === index;
              const panelId = `ms-round-panel-${draft.id}`;
              return (
                <li key={draft.id} className={cn("rounded-lg border bg-background", failing ? "border-destructive" : "border-border")}>
                  <div className="flex items-center gap-1 p-1.5 pl-3">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={open ? panelId : undefined}
                      onClick={() => setOpenId(open ? null : draft.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary font-mono text-xs font-semibold tabular-nums">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          Round {index + 1} <LevelBadge config={draft.config} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{describeRound(draft.config)}</span>
                      </span>
                      <ChevronDown className={cn("mr-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} aria-hidden />
                    </button>
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="icon-sm" aria-label={`Move round ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Move round ${index + 1} down`} disabled={index === drafts.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Duplicate round ${index + 1}`} disabled={drafts.length >= LIMITS.rounds.max} onClick={() => duplicate(index)}>
                        <Copy />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove round ${index + 1}`} disabled={drafts.length <= LIMITS.rounds.min} onClick={() => remove(draft.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <div id={panelId} className="animate-in fade-in border-t border-border p-4 duration-150">
                      <RoundEditor config={draft.config} onChange={(config) => update(draft.id, config)} />
                      {drafts.length > 1 && (
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => applyToAll(draft.config)}>
                          Use these settings for all rounds
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <aside className="rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20" aria-label="Session">
        <h2 className="text-[15px] font-semibold tracking-tight">Session</h2>
        <div className="mt-4 space-y-4">
          <Stepper label="Rounds" value={drafts.length} min={LIMITS.rounds.min} max={LIMITS.rounds.max} onChange={setRoundCount} />
          <Switch
            label="Sound"
            hint="Countdown, start and result cues"
            checked={sound}
            onChange={onSoundChange}
          />
        </div>

        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Rounds</dt>
            <dd className="font-mono font-medium tabular-nums">{drafts.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Top score</dt>
            <dd className="font-mono font-medium tabular-nums">{totalPoints.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Length</dt>
            <dd className="font-medium">{formatDuration(estimateSeconds(configs))}</dd>
          </div>
        </dl>

        {problem && (
          <p role="alert" className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {problem.message}
          </p>
        )}

        <Button size="xl" className="mt-5 w-full" disabled={starting || !loaded} onClick={() => onStart(configs)}>
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

