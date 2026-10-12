import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sudokuSessions } from "@/db/schema";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { MAX_UPLOAD_SESSIONS } from "@/lib/history/sync";
import { parseSessionData } from "@/lib/sudoku/records";
import { scoreGame } from "@/lib/sudoku/scoring";
import { readJson } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The most games sent back to a device at once. */
const MAX_PULL = 100;

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, difficulty, puzzle, completed, elapsedMs, mistakes, hintsUsed }] }
 *
 * Stores Sudoku games that ended on the user's device (possibly offline). Idempotent per game (`clientId`), so the
 * browser can safely retry. Nothing the browser says about points is used: the puzzle is checked to have exactly one
 * solution, the counters and times must be plausible, and the score is worked out again here.
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
      const parsed = parseSessionData(raw, { now: Date.now(), verify: true });
      if (!parsed.ok) {
        rejected.push({ clientId: parsed.clientId, reason: parsed.reason });
        continue;
      }
      const { data } = parsed;
      await db
        .insert(sudokuSessions)
        .values({
          userId: user.id,
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
        .onConflictDoNothing();
      synced.push({ clientId: data.clientId });
    }
  } catch (error) {
    console.error("Failed to sync Sudoku games:", error);
    return NextResponse.json({ error: "Failed to sync", synced, rejected }, { status: 500 });
  }
  return NextResponse.json({ synced, rejected });
}

/** The account's latest games, so a device can show history played elsewhere. Dates are epoch milliseconds. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  try {
    const rows = await db.select().from(sudokuSessions).where(eq(sudokuSessions.userId, user.id)).orderBy(desc(sudokuSessions.endedAt)).limit(MAX_PULL);
    const sessions = rows.map((r) => ({
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
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to load Sudoku games:", error);
    return NextResponse.json({ error: "Failed to load games" }, { status: 500 });
  }
}
