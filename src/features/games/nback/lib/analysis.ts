import type { PuzzleDifficulty } from "@/features/rewards/lib/economy";
import { setsBestN } from "./adaptive";
import { streamMode } from "./config";
import { difficultyOf } from "./difficulty";
import { generateSequence, paramsFromConfig } from "./generator";
import { scoreSession, sessionPoints, type SessionResult } from "./scoring";
import type { SessionData, StreamMode } from "./types";

/** Everything worked out from a saved session by replaying it. Nothing here is stored. */
export interface Analysis {
  result: SessionResult;
  /** Overall accuracy, percent, not rounded. */
  accuracy: number;
  points: number;
  difficulty: PuzzleDifficulty;
  mode: StreamMode;
  /** Whether the session counts for the best n of its mode. */
  setsBestN: boolean;
}

const cache = new Map<string, Analysis>();
const CACHE_LIMIT = 400;

/** Replays a session through the generator and the scorer. The same record always gives the same answer, so results are remembered by client id. */
export function analyze(data: SessionData): Analysis {
  const key = `${data.clientId}:${data.seed}:${data.responses.length}`;
  const known = cache.get(key);
  if (known) return known;
  const result = scoreSession({ config: data.config, trials: generateSequence(paramsFromConfig(data.config, data.seed)), responses: data.responses });
  const accuracy = result.overall.accuracy;
  const analysis: Analysis = {
    result,
    accuracy,
    points: sessionPoints(result, data.config.n),
    difficulty: difficultyOf(data.config),
    mode: streamMode(data.config),
    setsBestN: setsBestN({ outcome: data.outcome, accuracy }),
  };
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, analysis);
  return analysis;
}
