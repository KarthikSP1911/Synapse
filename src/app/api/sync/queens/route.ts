import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { queensSessions } from "@/db/schema";
import { createHistoryRoute } from "@/features/games/shared/lib/history/route";
import { parseSessionData } from "@/features/games/queens/lib/records";
import { scoreGame } from "@/features/games/queens/lib/scoring";

export const dynamic = "force-dynamic";

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, difficulty, puzzle, completed, elapsedMs, hintsUsed }] }
 *
 * Stores Queens games that ended on the user's device (possibly offline). Idempotent per game (`clientId`), so the
 * browser can safely retry. Nothing the browser says about points is used: the board is checked to have exactly one
 * solution, the counters and times must be plausible, and the score is worked out again here.
 *
 * GET returns the account's latest games, so a device can show history played elsewhere.
 * See `createHistoryRoute` for the reply shapes.
 */
const route = createHistoryRoute({
  label: "Queens games",
  noun: "games",
  parse: (raw) => parseSessionData(raw, { now: Date.now(), verify: true }),
  insert: (userId, data) =>
    db
      .insert(queensSessions)
      .values({
        userId,
        clientId: data.clientId,
        difficulty: data.difficulty,
        puzzle: data.puzzle,
        completed: data.completed,
        elapsedMs: data.elapsedMs,
        hintsUsed: data.hintsUsed,
        score: scoreGame(data).total,
        startedAt: new Date(data.startedAt),
        endedAt: new Date(data.endedAt),
      })
      // The same game sent twice (a retry, or two tabs): the first one stays.
      .onConflictDoNothing(),
  recent: async (userId, limit) => {
    const rows = await db.select().from(queensSessions).where(eq(queensSessions.userId, userId)).orderBy(desc(queensSessions.endedAt)).limit(limit);
    return rows.map((r) => ({
      clientId: r.clientId,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt.getTime(),
      difficulty: r.difficulty,
      puzzle: r.puzzle,
      completed: r.completed,
      elapsedMs: r.elapsedMs,
      hintsUsed: r.hintsUsed,
    }));
  },
});

export const POST = route.POST;
export const GET = route.GET;
