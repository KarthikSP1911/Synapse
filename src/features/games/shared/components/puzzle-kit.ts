import type { ComponentType, ReactNode } from "react";
import type { LocalStore } from "@/features/offline/lib/guest/api";
import type { Clocked } from "@/features/games/shared/lib/clock";
import type { Difficulty, ScoreBreakdown } from "@/features/games/shared/lib/puzzle-session";
import type { PuzzleRecord, PuzzleStats } from "@/features/games/shared/lib/puzzle-stats";
import type { AccentId } from "@/lib/accent";

/**
 * What a puzzle game (Queens, Zip, Patches) hands to the shared app shell (`puzzle-app.tsx`): its pure game functions, its
 * storage, and the screens that are specific to it. The shell owns everything the games have in common: setup,
 * resuming an unfinished game, saving and uploading finished ones, the results screen and the stats tab.
 */

/** The part of a game in progress the shell needs. */
export interface PuzzleGame extends Clocked {
  clientId: string;
  difficulty: Difficulty;
  startedAt: number;
}

/** The props of a game's play screen. */
export interface PlayScreenProps<G extends PuzzleGame, S> {
  /** The game to play. A game restored from storage arrives paused. */
  initial: G;
  settings: S;
  onSettingsChange: (settings: S) => void;
  /** Called with the state whenever it changes, for saving. */
  onChange: (game: G) => void;
  /** The puzzle was solved. */
  onEnd: (game: G) => void;
  /** Back to the setup screen with the game kept. */
  onLeave: (game: G) => void;
  /** Back to the setup screen, giving this game up. */
  onAbandon: (game: G) => void;
}

export interface PuzzleKit<G extends PuzzleGame, S, D extends PuzzleRecord> {
  accent: Extract<AccentId, "queens" | "zip" | "patches">;
  /** "Queens". */
  name: string;
  /** What one game is called: "puzzle". */
  noun: string;
  description: string;
  /** Short prefix for element ids ("qn"). */
  idPrefix: string;
  defaultSettings: S;
  difficultyDescription: Record<Difficulty, string>;
  /** The board of each difficulty, for the start card ("6 × 6"); a function when the settings change the size. */
  boardLabel: Record<Difficulty, string> | ((settings: S) => Record<Difficulty, string>);
  /** Builds a game of this difficulty with the player's current settings; throws when no puzzle could be built within the budget. */
  newGame: (difficulty: Difficulty, clientId: string, now: number, settings: S) => G;
  freeze: (game: G, now: number) => G;
  resume: (game: G, now: number) => G;
  hasProgress: (game: G) => boolean;
  toSessionData: (game: G, now: number) => D;
  score: (data: D) => ScoreBreakdown;
  computeStats: (history: readonly D[], unfinished: Difficulty | null) => PuzzleStats<D>;
  /** A line about an unfinished game: "Easy · 2:15 played · 3 of 6 queens placed" without the time. */
  progressLabel: (game: G) => string;
  storage: {
    loadHistory: (store: LocalStore) => D[];
    saveSession: (store: LocalStore, data: D) => boolean;
    loadGame: (store: LocalStore) => G | null;
    saveGame: (store: LocalStore, game: G) => boolean;
    clearGame: (store: LocalStore) => void;
    loadSettings: () => S;
    saveSettings: (settings: S) => void;
    loadDifficulty: () => Difficulty;
    saveDifficulty: (difficulty: Difficulty) => void;
  };
  /** Uploads waiting games for a signed-in user (and with `pull`, brings in games from other devices). */
  sync: (userId: number, options?: { pull?: boolean }) => Promise<{ ok: boolean }>;
  PlayScreen: ComponentType<PlayScreenProps<G, S>>;
  /** The assistance switches, on the setup screen. */
  Assistance: ComponentType<{ settings: S; onChange: (settings: S) => void }>;
  /** A short explanation of the rules, on the setup screen. */
  rules: ReactNode;
}
