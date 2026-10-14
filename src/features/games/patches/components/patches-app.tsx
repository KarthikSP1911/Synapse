"use client";

import PuzzleApp from "@/features/games/shared/components/puzzle-app";
import type { PuzzleKit } from "@/features/games/shared/components/puzzle-kit";
import { AssistanceSwitches, GameScreen } from "@/features/games/patches/components/game-screen";
import { freezeForStorage, hasProgress, newGame, remaining, resumeGame, toSessionData } from "@/features/games/patches/lib/game";
import { generatePuzzle, sizeFor } from "@/features/games/patches/lib/generator";
import { scoreGame } from "@/features/games/patches/lib/scoring";
import { computeStats } from "@/features/games/patches/lib/stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, saveDifficulty, saveGame, saveSession, saveSettings } from "@/features/games/patches/lib/storage";
import { syncPatches } from "@/features/games/patches/lib/sync";
import { DEFAULT_SETTINGS, DIFFICULTIES, type GameState, type PatchesSettings, type SessionData } from "@/features/games/patches/lib/types";

const kit: PuzzleKit<GameState, PatchesSettings, SessionData> = {
  accent: "patches",
  name: "Patches",
  noun: "puzzle",
  description: "Divide the grid into patches, each holding one clue and matching its area and shape.",
  idPrefix: "pt",
  defaultSettings: DEFAULT_SETTINGS,
  difficultyDescription: {
    easy: "A small board, every clue shows its area.",
    medium: "More shapes to read and clues that say less.",
    hard: "Freeform patches, plain clues and a lookahead or two.",
    expert: "The biggest boards, the least written, chains of deductions.",
  },
  boardLabel: (settings) => Object.fromEntries(DIFFICULTIES.map((d) => [d, `${sizeFor(d, settings.larger)} × ${sizeFor(d, settings.larger)}`])) as Record<(typeof DIFFICULTIES)[number], string>,
  newGame: (difficulty, clientId, now, settings) => newGame(generatePuzzle(difficulty, Math.random, undefined, undefined, settings.larger), clientId, now),
  freeze: freezeForStorage,
  resume: resumeGame,
  hasProgress,
  toSessionData,
  score: scoreGame,
  computeStats,
  progressLabel: (g) => `${remaining(g)} cells left`,
  storage: { loadHistory, saveSession, loadGame, saveGame, clearGame, loadSettings, saveSettings, loadDifficulty, saveDifficulty },
  sync: syncPatches,
  PlayScreen: GameScreen,
  Assistance: AssistanceSwitches,
  rules: (
    <>
      <p>Divide the whole grid into patches. Every cell belongs to exactly one patch, and every patch holds exactly one clue.</p>
      <p>A number is the patch&apos;s area. A symbol is its shape: a square, a wide rectangle, a tall rectangle, or a freeform shape of any outline (drag across its cells). A clue with only a dot says nothing, so its patch is any rectangle.</p>
      <p>Drag from one corner of a patch to the opposite one; the patch fills with the colour of its clue as you go. Drag from the edge of a patch to resize it, draw over a patch to replace it, or tap a patch to erase it. Undo takes any of that back.</p>
    </>
  ),
};

export default function PatchesApp() {
  return <PuzzleApp kit={kit} />;
}
