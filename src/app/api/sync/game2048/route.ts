import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { game2048Sessions } from "@/db/schema";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { parseSessionData } from "@/lib/game2048/records";
import { MAX_UPLOAD_SESSIONS } from "@/lib/history/sync";
import { readJson } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The most games sent back to a device at once. */
const MAX_PULL = 100;

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, score, highestTile, moves, durationMs, reached2048, gameOver, undosUsed }] }
 *
 * Stores 2048 games that ended on the user's device (possibly offline). Idempotent per game (`clientId`), so the
 * browser can safely retry. The moves are not part of the record, so each figure is only checked to be possible
 * (a tile the board can hold, a score and move count that could produce it, a time that fits the dates).
 *
 * Reply: { synced: [{ clientId }], rejected: [{ clientId, reason }] }. A rejected game is permanently invalid
 * (retrying cannot help); a server failure is a 5xx instead.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readJson(request);
  if (!body || !Array.isArray(body.sessions)) return NextResponse.json({ error: "Expected { sessions: [...] }" }, { status: 400 });
  if (body.sessions.length > MAX_UPLOAD_SESSIONS) {
    return NextResponse.json({ error: `At most ${MAX_UPLOAD_SESSIONS} sessions per request` }, { status: 400 });
  }

  const synced: { clientId: string }[] = [];
  const rejected: { clientId: string | null; reason: string }[] = [];
  try {
    for (const raw of body.sessions) {
      const parsed = parseSessionData(raw, Date.now());
      if (!parsed.ok) {
        rejected.push({ clientId: parsed.clientId, reason: parsed.reason });
        continue;
      }
      const { data } = parsed;
      await db
        .insert(game2048Sessions)
        .values({
          userId: user.id,
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
        .onConflictDoNothing();
      synced.push({ clientId: data.clientId });
    }
  } catch (error) {
    console.error("Failed to sync 2048 games:", error);
    return NextResponse.json({ error: "Failed to sync", synced, rejected }, { status: 500 });
  }
  return NextResponse.json({ synced, rejected });
}

/** The account's latest games, so a device can show history played elsewhere. Dates are epoch milliseconds. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  try {
    const rows = await db.select().from(game2048Sessions).where(eq(game2048Sessions.userId, user.id)).orderBy(desc(game2048Sessions.endedAt)).limit(MAX_PULL);
    const sessions = rows.map((r) => ({
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
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to load 2048 games:", error);
    return NextResponse.json({ error: "Failed to load games" }, { status: 500 });
  }
}
