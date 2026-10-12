"use client";

import { ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/game/controls";
import { ACCENT } from "@/lib/skills/accent";
import { elapsedAt } from "@/lib/sudoku/game";
import { formatTime } from "@/lib/sudoku/scoring";
import type { SudokuStats } from "@/lib/sudoku/stats";
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty, type GameState, type SudokuSettings } from "@/lib/sudoku/types";

const DESCRIPTION: Record<Difficulty, string> = {
  easy: "Singles only. A good place to learn the basics.",
  medium: "Needs locked candidates and pairs.",
  hard: "Triples, X-Wing and XY-Wing.",
  expert: "Beyond those: deep reasoning.",
};

export function SetupScreen({
  difficulty,
  onDifficulty,
  stats,
  saved,
  settings,
  onSettingsChange,
  generating,
  failed,
  onStart,
  onResume,
}: {
  difficulty: Difficulty;
  onDifficulty: (difficulty: Difficulty) => void;
  stats: SudokuStats | null;
  /** The unfinished game stored on this device, if any. */
  saved: GameState | null;
  settings: SudokuSettings;
  onSettingsChange: (settings: SudokuSettings) => void;
  generating: boolean;
  failed: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  const left = saved ? saved.cells.filter((c) => c.value === 0).length : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="sdk-difficulty">
          <h2 id="sdk-difficulty" className="text-[15px] font-semibold tracking-tight">
            Difficulty
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Set by the techniques a puzzle needs, not by how many cells are empty.</p>
          <div role="group" aria-labelledby="sdk-difficulty" className="mt-4 grid gap-2 sm:grid-cols-2">
            {DIFFICULTIES.map((d) => {
              const active = d === difficulty;
              const best = stats?.byDifficulty[d].bestTimeMs ?? null;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDifficulty(d)}
                  style={active ? { borderColor: ACCENT.sudoku, boxShadow: `0 0 0 1px ${ACCENT.sudoku}` } : undefined}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active ? "bg-card" : "border-border bg-background hover:border-input hover:bg-accent/60"
                  )}
                >
                  <span className="text-[15px] font-semibold tracking-tight">{DIFFICULTY_LABEL[d]}</span>
                  <span className="text-xs text-muted-foreground">{DESCRIPTION[d]}</span>
                  <span className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{best === null ? "No best time yet" : `Best ${formatTime(best)}`}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="sdk-assist">
          <h2 id="sdk-assist" className="text-[15px] font-semibold tracking-tight">
            Assistance
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Hints and Check are always optional. These two decide how much the board tells you.</p>
          <div className="mt-4 grid gap-5">
            <Switch
              label="Mark wrong entries as I go"
              hint="Off: duplicates and wrong digits are only shown when you press Check"
              checked={settings.highlight === "instant"}
              onChange={(on) => onSettingsChange({ ...settings, highlight: on ? "instant" : "check" })}
            />
            <Switch label="Count mistakes" hint="Wrong digits are counted as they are entered and lower the score a little" checked={settings.trackMistakes} onChange={(trackMistakes) => onSettingsChange({ ...settings, trackMistakes })} />
          </div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Start">
        {saved && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-card" style={{ borderColor: ACCENT.sudoku }}>
            <h2 className="text-[15px] font-semibold tracking-tight">Unfinished game</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {DIFFICULTY_LABEL[saved.difficulty]} · {formatTime(elapsedAt(saved, 0))} played · {left} {left === 1 ? "cell" : "cells"} left
            </p>
            <Button size="lg" className="mt-4 w-full" onClick={onResume}>
              <Play /> Resume
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-[15px] font-semibold tracking-tight">New game</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Difficulty</dt>
              <dd className="font-medium">{DIFFICULTY_LABEL[difficulty]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Grid</dt>
              <dd className="font-medium">9 × 9, one solution</dd>
            </div>
          </dl>
          <Button size="xl" variant={saved ? "outline" : "default"} className="mt-5 w-full" disabled={generating} onClick={onStart}>
            {generating ? "Building puzzle…" : "Start new game"}
            {!generating && <ArrowRight />}
          </Button>
          {failed && (
            <p role="alert" className="mt-3 text-center text-xs text-destructive">
              A puzzle could not be built. Please try again.
            </p>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">Each row, column and 3×3 box must hold 1 to 9 exactly once.</p>
        </div>
      </aside>
    </div>
  );
}
