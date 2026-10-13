import { createHistorySync } from "@/features/games/shared/lib/history/sync";
import { dataOrNull } from "@/lib/records";
import { mindsprintHistory } from "./storage";
import { parseSessionData } from "./records";

/** Uploads MindSprint sessions for a signed-in user; see `src/features/games/shared/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: mindsprintHistory,
  endpoint: "/api/sync/mindsprint",
  parse: dataOrNull(parseSessionData),
  payload: (s) => ({ clientId: s.clientId, startedAt: s.startedAt, endedAt: s.endedAt, rounds: s.rounds }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncMindsprint = sync.sync;
