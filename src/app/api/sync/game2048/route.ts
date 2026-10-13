import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { game2048Sessions } from "@/db/schema";
import { parseSessionData } from "@/lib/game2048/records";
import { createHistoryRoute } from "@/lib/history/route";

export const dynamic = "force-dynamic";

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, score, highestTile, moves, durationMs, reached2048, gameOver, undosUsed }] }
 *
 * Stores 2048 games that ended on the user's device (possibly offline). Idempotent per game (`clientId`), so the
 * browser can safely retry. The moves are not part of the record, so each figure is only checked to be possible
 * (a tile the board can hold, a score and move count that could produce it, a time that fits the dates).
 *
 * GET returns the account's latest games, so a device can show history played elsewhere.
 * See `createHistoryRoute` for the reply shapes.
 */
const route = createHistoryRoute({
  label: "2048 games",
  noun: "games",
  parse: (raw) => parseSessionData(raw, Date.now()),
  insert: (userId, data) =>
    db
      .insert(game2048Sessions)
      .values({
        userId,
        clientId: data.clientId,
        score: data.score,
        highestTile: data.highestTile,
        moves: data.moves,
        durationMs: data.durationMs,
        reached2048: data.reached2048,
        gameOver: data.gameOver,
        undosUsed: data.undosUsed,
        startedAt: new Date(data.startedAt),
        endedAt: new Date(data.endedAt),
      })
      // The same game sent twice (a retry, or two tabs): the first one stays.
      .onConflictDoNothing(),
  recent: async (userId, limit) => {
    const rows = await db.select().from(game2048Sessions).where(eq(game2048Sessions.userId, userId)).orderBy(desc(game2048Sessions.endedAt)).limit(limit);
    return rows.map((r) => ({
      clientId: r.clientId,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt.getTime(),
      score: r.score,
      highestTile: r.highestTile,
      moves: r.moves,
      durationMs: r.durationMs,
      reached2048: r.reached2048,
      gameOver: r.gameOver,
      undosUsed: r.undosUsed,
    }));
  },
});

export const POST = route.POST;
export const GET = route.GET;
