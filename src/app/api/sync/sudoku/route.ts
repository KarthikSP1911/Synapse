import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sudokuSessions } from "@/db/schema";
import { createHistoryRoute } from "@/features/games/shared/lib/history/route";
import { parseSessionData } from "@/features/games/sudoku/lib/records";
import { sessionGrants } from "@/features/games/sudoku/lib/rewards";
import { scoreGame } from "@/features/games/sudoku/lib/scoring";

export const dynamic = "force-dynamic";

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, difficulty, puzzle, completed, elapsedMs, mistakes, hintsUsed }] }
 *
 * Stores Sudoku games that ended on the user's device (possibly offline). Idempotent per game (`clientId`), so the
 * browser can safely retry. Nothing the browser says about points is used: the puzzle is checked to have exactly one
 * solution, the counters and times must be plausible, and the score is worked out again here.
 *
 * GET returns the account's latest games, so a device can show history played elsewhere.
 * See `createHistoryRoute` for the reply shapes.
 */
const route = createHistoryRoute({
  label: "Sudoku games",
  noun: "games",
  parse: (raw) => parseSessionData(raw, { now: Date.now(), verify: true }),
  grants: sessionGrants,
  insert: (userId, data) =>
    db
      .insert(sudokuSessions)
      .values({
        userId,
        clientId: data.clientId,
        difficulty: data.difficulty,
        puzzle: data.puzzle,
        completed: data.completed,
        elapsedMs: data.elapsedMs,
        mistakes: data.mistakes,
        hintsUsed: data.hintsUsed,
        score: scoreGame(data).total,
        startedAt: new Date(data.startedAt),
        endedAt: new Date(data.endedAt),
      })
      // The same game sent twice (a retry, or two tabs): the first one stays.
      .onConflictDoNothing(),
  recent: async (userId, limit) => {
    const rows = await db.select().from(sudokuSessions).where(eq(sudokuSessions.userId, userId)).orderBy(desc(sudokuSessions.endedAt)).limit(limit);
    return rows.map((r) => ({
      clientId: r.clientId,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt.getTime(),
      difficulty: r.difficulty,
      puzzle: r.puzzle,
      completed: r.completed,
      elapsedMs: r.elapsedMs,
      mistakes: r.mistakes,
      hintsUsed: r.hintsUsed,
    }));
  },
});

export const POST = route.POST;
export const GET = route.GET;
