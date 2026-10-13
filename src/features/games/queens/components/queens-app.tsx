"use client";

import PuzzleApp from "@/features/games/shared/components/puzzle-app";
import type { PuzzleKit } from "@/features/games/shared/components/puzzle-kit";
import { AssistanceSwitches, GameScreen } from "@/features/games/queens/components/game-screen";
import { freezeForStorage, hasProgress, newGame, queensOn, resumeGame, toSessionData } from "@/features/games/queens/lib/game";
import { PROFILES, generatePuzzle } from "@/features/games/queens/lib/generator";
import { scoreGame } from "@/features/games/queens/lib/scoring";
import { computeStats } from "@/features/games/queens/lib/stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, saveDifficulty, saveGame, saveSession, saveSettings } from "@/features/games/queens/lib/storage";
import { syncQueens } from "@/features/games/queens/lib/sync";
import { DEFAULT_SETTINGS, DIFFICULTIES, type GameState, type QueensSettings, type SessionData } from "@/features/games/queens/lib/types";

const kit: PuzzleKit<GameState, QueensSettings, SessionData> = {
  accent: "queens",
  name: "Queens",
  noun: "puzzle",
  description: "Place one queen in every row, column and colour region, with no two queens touching.",
  idPrefix: "qn",
  defaultSettings: DEFAULT_SETTINGS,
  difficultyDescription: {
    easy: "Direct deductions only. A good place to learn.",
    medium: "Needs a look ahead: what if a queen were here?",
    hard: "Needs several regions reasoned about together.",
    expert: "The deepest chains of reasoning, on the biggest board.",
  },
  boardLabel: Object.fromEntries(DIFFICULTIES.map((d) => [d, `${PROFILES[d].size} × ${PROFILES[d].size}`])) as Record<(typeof DIFFICULTIES)[number], string>,
  newGame: (difficulty, clientId, now) => newGame(generatePuzzle(difficulty), clientId, now),
  freeze: freezeForStorage,
  resume: resumeGame,
  hasProgress,
  toSessionData,
  score: scoreGame,
  computeStats,
  progressLabel: (g) => `${queensOn(g.cells).length} of ${g.size} queens placed`,
  storage: { loadHistory, saveSession, loadGame, saveGame, clearGame, loadSettings, saveSettings, loadDifficulty, saveDifficulty },
  sync: syncQueens,
  PlayScreen: GameScreen,
  Assistance: AssistanceSwitches,
  rules: (
    <>
      <p>Put exactly one queen in every row, every column and every colour region.</p>
      <p>No two queens may touch, not even diagonally.</p>
      <p>Tap a square once to cross it out, twice for a queen, three times to clear it. Drag across empty squares to cross out many at once.</p>
    </>
  ),
};

export default function QueensApp() {
  return <PuzzleApp kit={kit} />;
}
