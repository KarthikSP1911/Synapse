import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recallSessions } from "@/db/schema";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { MAX_UPLOAD_SESSIONS } from "@/lib/history/sync";
import { parseSessionData } from "@/lib/recall/records";
import { scoreSession } from "@/lib/recall/scoring";
import { readJson } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The most sessions sent back to a device at once. */
const MAX_PULL = 100;

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, config, rounds: [{ sequence, answer, responseMs }] }] }
 *
 * Stores Number Recall sessions that were played on the user's device (possibly offline). Idempotent per session
 * (`clientId`), so the browser can safely retry. Nothing the browser says about points is used: every sequence is
 * checked against the settings (items keep their full width, lengths follow the progression rules) and the score
 * is worked out again here from the sequence and the answer.
 *
 * Reply: { synced: [{ clientId }], rejected: [{ clientId, reason }] }. A rejected session is permanently invalid
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
      const scored = scoreSession(data.config, data.rounds);
      await db
        .insert(recallSessions)
        .values({
          userId: user.id,
          clientId: data.clientId,
          mode: data.config.mode,
          config: data.config,
          rounds: data.rounds,
          roundCount: scored.total,
          perfectCount: scored.perfect,
          score: scored.score,
          accuracy: scored.accuracy,
          longestRecalled: scored.longestRecalled,
          startedAt: new Date(data.startedAt),
          endedAt: new Date(data.endedAt),
        })
        // The same session sent twice (a retry, or two tabs): the first one stays.
        .onConflictDoNothing();
      synced.push({ clientId: data.clientId });
    }
  } catch (error) {
    console.error("Failed to sync Number Recall sessions:", error);
    return NextResponse.json({ error: "Failed to sync", synced, rejected }, { status: 500 });
  }
  return NextResponse.json({ synced, rejected });
}

/** The account's latest sessions, so a device can show history played elsewhere. Dates are epoch milliseconds. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  try {
    const rows = await db.select().from(recallSessions).where(eq(recallSessions.userId, user.id)).orderBy(desc(recallSessions.endedAt)).limit(MAX_PULL);
    const sessions = rows.map((r) => ({ clientId: r.clientId, startedAt: r.startedAt.getTime(), endedAt: r.endedAt.getTime(), config: r.config, rounds: r.rounds }));
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to load Number Recall sessions:", error);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}
