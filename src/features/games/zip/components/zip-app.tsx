"use client";

import PuzzleApp from "@/features/games/shared/components/puzzle-app";
import type { PuzzleKit } from "@/features/games/shared/components/puzzle-kit";
import { AssistanceSwitches, GameScreen } from "@/features/games/zip/components/game-screen";
import { freezeForStorage, hasProgress, newGame, remaining, resumeGame, toSessionData } from "@/features/games/zip/lib/game";
import { PROFILES, generatePuzzle } from "@/features/games/zip/lib/generator";
import { scoreGame } from "@/features/games/zip/lib/scoring";
import { computeStats } from "@/features/games/zip/lib/stats";
import { clearGame, loadDifficulty, loadGame, loadHistory, loadSettings, saveDifficulty, saveGame, saveSession, saveSettings } from "@/features/games/zip/lib/storage";
import { syncZip } from "@/features/games/zip/lib/sync";
import { DEFAULT_SETTINGS, DIFFICULTIES, type GameState, type SessionData, type ZipSettings } from "@/features/games/zip/lib/types";

const kit: PuzzleKit<GameState, ZipSettings, SessionData> = {
  accent: "zip",
  name: "Zip",
  noun: "puzzle",
  description: "Connect the numbers in order with one path that fills every square.",
  idPrefix: "zp",
  defaultSettings: DEFAULT_SETTINGS,
  difficultyDescription: {
    easy: "A small board with plenty of numbers to guide you.",
    medium: "A bigger board, a few walls, fewer numbers.",
    hard: "Walls and sparse numbers: plan ahead.",
    expert: "The biggest board with the fewest clues.",
  },
  boardLabel: Object.fromEntries(DIFFICULTIES.map((d) => [d, `${PROFILES[d].rows} × ${PROFILES[d].cols}`])) as Record<(typeof DIFFICULTIES)[number], string>,
  newGame: (difficulty, clientId, now) => newGame(generatePuzzle(difficulty), clientId, now),
  freeze: freezeForStorage,
  resume: resumeGame,
  hasProgress,
  toSessionData,
  score: scoreGame,
  computeStats,
  progressLabel: (g) => `${remaining(g)} squares left`,
  storage: { loadHistory, saveSession, loadGame, saveGame, clearGame, loadSettings, saveSettings, loadDifficulty, saveDifficulty },
  sync: syncZip,
  PlayScreen: GameScreen,
  Assistance: AssistanceSwitches,
  rules: (
    <>
      <p>Draw one path that starts on 1, passes through the numbers in order, and fills every square exactly once.</p>
      <p>Move up, down, left or right. The bold lines are walls: the path cannot cross them.</p>
      <p>The highest number is where the path ends, so it opens only once every other square is filled. Drag back over your path to erase it.</p>
    </>
  ),
};

export default function ZipApp() {
  return <PuzzleApp kit={kit} />;
}
