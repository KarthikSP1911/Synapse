import { createHistorySync } from "@/features/games/shared/lib/history/sync";
import { dataOrNull } from "@/lib/records";
import { parseSessionData } from "./records";
import { patchesHistory } from "./storage";

/** Uploads Patches games for a signed-in user; see `src/features/games/shared/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: patchesHistory,
  endpoint: "/api/sync/patches",
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
export const syncPatches = sync.sync;
