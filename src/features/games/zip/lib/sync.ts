import { createHistorySync } from "@/features/games/shared/lib/history/sync";
import { dataOrNull } from "@/lib/records";
import { parseSessionData } from "./records";
import { zipHistory } from "./storage";

/** Uploads Zip games for a signed-in user; see `src/features/games/shared/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: zipHistory,
  endpoint: "/api/sync/zip",
  parse: dataOrNull(parseSessionData),
  payload: (s) => ({
    clientId: s.clientId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    difficulty: s.difficulty,
    puzzle: s.puzzle,
    completed: s.completed,
    elapsedMs: s.elapsedMs,
    hintsUsed: s.hintsUsed,
  }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncZip = sync.sync;
