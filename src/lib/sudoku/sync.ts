import { createHistorySync } from "@/lib/history/sync";
import { parseSessionData } from "./records";
import { sudokuHistory } from "./storage";

/** Uploads Sudoku games for a signed-in user; see `src/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: sudokuHistory,
  endpoint: "/api/sync/sudoku",
  parse: (raw) => {
    const parsed = parseSessionData(raw);
    return parsed.ok ? parsed.data : null;
  },
  payload: (s) => ({
    clientId: s.clientId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    difficulty: s.difficulty,
    puzzle: s.puzzle,
    completed: s.completed,
    elapsedMs: s.elapsedMs,
    mistakes: s.mistakes,
    hintsUsed: s.hintsUsed,
  }),
});

export const pendingCountFor = sync.pendingCountFor;
export const syncSudoku = sync.sync;
