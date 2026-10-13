import { createHistorySync } from "@/lib/history/sync";
import { dataOrNull } from "@/lib/records";
import { parseSessionData } from "./records";
import { recallHistory } from "./storage";

/** Uploads Number Recall sessions for a signed-in user; see `src/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: recallHistory,
  endpoint: "/api/sync/recall",
  parse: dataOrNull(parseSessionData),
  payload: (s) => ({ clientId: s.clientId, startedAt: s.startedAt, endedAt: s.endedAt, config: s.config, rounds: s.rounds }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncRecall = sync.sync;
