import { createHistorySync } from "@/features/games/shared/lib/history/sync";
import { dataOrNull } from "@/lib/records";
import { parseSessionData } from "./records";
import { nbackHistory } from "./storage";

/** Uploads N-Back sessions for a signed-in user; see `src/features/games/shared/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: nbackHistory,
  endpoint: "/api/sync/nback",
  parse: dataOrNull(parseSessionData),
  payload: (s) => ({
    clientId: s.clientId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    outcome: s.outcome,
    config: s.config,
    seed: s.seed,
    generator: s.generator,
    responses: s.responses,
    durationMs: s.durationMs,
  }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncNback = sync.sync;
