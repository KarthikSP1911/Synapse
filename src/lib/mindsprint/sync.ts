import { createHistorySync } from "@/lib/history/sync";
import { mindsprintHistory } from "./storage";
import { parseSessionData } from "./records";

/** Uploads MindSprint sessions for a signed-in user; see `src/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: mindsprintHistory,
  endpoint: "/api/sync/mindsprint",
  parse: (raw) => {
    const parsed = parseSessionData(raw);
    return parsed.ok ? parsed.data : null;
  },
  payload: (s) => ({ clientId: s.clientId, startedAt: s.startedAt, endedAt: s.endedAt, rounds: s.rounds }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncMindsprint = sync.sync;
