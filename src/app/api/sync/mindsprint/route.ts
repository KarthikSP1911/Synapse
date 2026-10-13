import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mindsprintSessions } from "@/db/schema";
import { createHistoryRoute } from "@/lib/history/route";
import { parseSessionData } from "@/lib/mindsprint/records";
import { scoreSession } from "@/lib/mindsprint/scoring";

export const dynamic = "force-dynamic";

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, rounds: [{ config, flashes, answer, responseMs }] }] }
 *
 * Stores MindSprint sessions that were played on the user's device (possibly offline). Idempotent per session
 * (`clientId`), so the browser can safely retry. Nothing the browser says about correctness is used: every round's
 * sequence is checked against its settings and the score is worked out again here from the sequence and the answer.
 *
 * GET returns the account's latest sessions, so a device can show history played elsewhere.
 * See `createHistoryRoute` for the reply shapes.
 */
const route = createHistoryRoute({
  label: "MindSprint sessions",
  noun: "sessions",
  parse: (raw) => parseSessionData(raw, Date.now()),
  insert: (userId, data) => {
    const scored = scoreSession(data.rounds);
    return (
      db
        .insert(mindsprintSessions)
        .values({
          userId,
          clientId: data.clientId,
          rounds: data.rounds,
          roundCount: scored.total,
          correctCount: scored.correct,
          score: scored.score,
          accuracy: scored.accuracy,
          averageResponseTimeMs: scored.averageResponseMs,
          startedAt: new Date(data.startedAt),
          endedAt: new Date(data.endedAt),
        })
        // The same session sent twice (a retry, or two tabs): the first one stays.
        .onConflictDoNothing()
    );
  },
  recent: async (userId, limit) => {
    const rows = await db.select().from(mindsprintSessions).where(eq(mindsprintSessions.userId, userId)).orderBy(desc(mindsprintSessions.endedAt)).limit(limit);
    return rows.map((r) => ({ clientId: r.clientId, startedAt: r.startedAt.getTime(), endedAt: r.endedAt.getTime(), rounds: r.rounds }));
  },
});

export const POST = route.POST;
export const GET = route.GET;
