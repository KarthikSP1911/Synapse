import { createHistorySync } from "@/lib/history/sync";
import { parseSessionData } from "./records";
import { game2048History } from "./storage";

/** Uploads 2048 games for a signed-in user; see `src/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: game2048History,
  endpoint: "/api/sync/game2048",
  parse: (raw) => {
    const parsed = parseSessionData(raw);
    return parsed.ok ? parsed.data : null;
  },
  payload: (s) => ({
    clientId: s.clientId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    score: s.score,
    highestTile: s.highestTile,
    moves: s.moves,
    durationMs: s.durationMs,
    reached2048: s.reached2048,
    gameOver: s.gameOver,
    undosUsed: s.undosUsed,
  }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncGame2048 = sync.sync;
