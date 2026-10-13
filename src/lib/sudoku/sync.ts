import { createHistorySync } from "@/lib/history/sync";
import { dataOrNull } from "@/lib/records";
import { parseSessionData } from "./records";
import { sudokuHistory } from "./storage";

/** Uploads Sudoku games for a signed-in user; see `src/lib/history/sync.ts`. */
const sync = createHistorySync({
  history: sudokuHistory,
  endpoint: "/api/sync/sudoku",
  parse: dataOrNull(parseSessionData),
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
