import type { PuzzleDifficulty } from "@/features/rewards/lib/economy";
import { activeStreams } from "./config";
import type { NBackConfig } from "./types";

/**
 * How hard a setup is, mapped onto the difficulty scale the coin economy already pays by (`ECONOMY.puzzle`), so
 * N-Back needs no reward amounts of its own. The load is the n of the task, two more for each extra stream, one for
 * a big board when Position is in play, and up to two for fast trials.
 */
export function difficultyLoad(config: Pick<NBackConfig, "n" | "streams" | "grid" | "trialMs">): number {
  const streams = activeStreams(config).length;
  const bigBoard = config.streams.position && config.grid >= 5 ? 1 : 0;
  const speed = config.trialMs <= 1500 ? 2 : config.trialMs <= 2000 ? 1 : 0;
  return config.n + 2 * (Math.max(1, streams) - 1) + bigBoard + speed;
}

export function difficultyOf(config: Pick<NBackConfig, "n" | "streams" | "grid" | "trialMs">): PuzzleDifficulty {
  const load = difficultyLoad(config);
  return load <= 3 ? "easy" : load <= 6 ? "medium" : load <= 9 ? "hard" : "expert";
}
