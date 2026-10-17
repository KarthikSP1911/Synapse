"use client";

import { Switch } from "@/components/form/choice-controls";
import { PuzzleSetup } from "@/features/games/shared/components/puzzle-setup";
import { elapsedAt } from "@/features/games/sudoku/lib/game";
import type { SudokuStats } from "@/features/games/sudoku/lib/stats";
import { DEFAULT_SETTINGS, DIFFICULTIES, type Difficulty, type GameState, type SudokuSettings } from "@/features/games/sudoku/lib/types";
import { sameValue } from "@/lib/same-value";

const DESCRIPTION: Record<Difficulty, string> = {
  easy: "Singles only. A good place to learn the basics.",
  medium: "Needs locked candidates and pairs.",
  hard: "Triples, X-Wing and XY-Wing.",
  expert: "Beyond those: deep reasoning.",
};

const BOARD = Object.fromEntries(DIFFICULTIES.map((d) => [d, "9 × 9"])) as Record<Difficulty, string>;

/** The difficulty a game opens with until the player picks another. */
const DEFAULT_DIFFICULTY: Difficulty = "easy";

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
  const bestTimes = Object.fromEntries(DIFFICULTIES.map((d) => [d, stats?.byDifficulty[d].bestTimeMs ?? null])) as Record<Difficulty, number | null>;
  const isDefault = sameValue(settings, DEFAULT_SETTINGS);

  return (
    <PuzzleSetup
      accent="sudoku"
      difficulty={difficulty}
      onDifficulty={onDifficulty}
      descriptions={DESCRIPTION}
      boardLabel={BOARD}
      bestTimes={bestTimes}
      saved={saved ? { difficulty: saved.difficulty, playedMs: elapsedAt(saved, 0), progress: `${left} ${left === 1 ? "cell" : "cells"} left` } : null}
      assistance={
        <>
          <Switch
            label="Mark wrong entries as I go"
            hint="Off: duplicates and wrong digits are only shown when you press Check"
            checked={settings.highlight === "instant"}
            onChange={(on) => onSettingsChange({ ...settings, highlight: on ? "instant" : "check" })}
          />
          <Switch label="Count mistakes" hint="Wrong digits are counted as they are entered and lower the score a little" checked={settings.trackMistakes} onChange={(trackMistakes) => onSettingsChange({ ...settings, trackMistakes })} />
        </>
      }
      customized={!isDefault}
      changed={!isDefault || difficulty !== DEFAULT_DIFFICULTY}
      onReset={() => {
        onSettingsChange(DEFAULT_SETTINGS);
        onDifficulty(DEFAULT_DIFFICULTY);
      }}
      rules={
        <>
          <p>Each row, column and 3×3 box must hold 1 to 9 exactly once.</p>
          <p>Difficulty is set by the techniques a puzzle needs, not by how many cells are empty. Hints and Check are always optional.</p>
        </>
      }
      generating={generating}
      failed={failed}
      onStart={onStart}
      onResume={onResume}
    />
  );
}
