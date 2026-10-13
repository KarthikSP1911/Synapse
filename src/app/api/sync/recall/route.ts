import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recallSessions } from "@/db/schema";
import { createHistoryRoute } from "@/lib/history/route";
import { parseSessionData } from "@/lib/recall/records";
import { scoreSession } from "@/lib/recall/scoring";

export const dynamic = "force-dynamic";

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, config, rounds: [{ sequence, answer, responseMs }] }] }
 *
 * Stores Number Recall sessions that were played on the user's device (possibly offline). Idempotent per session
 * (`clientId`), so the browser can safely retry. Nothing the browser says about points is used: every sequence is
 * checked against the settings (items keep their full width, lengths follow the progression rules) and the score
 * is worked out again here from the sequence and the answer.
 *
 * GET returns the account's latest sessions, so a device can show history played elsewhere.
 * See `createHistoryRoute` for the reply shapes.
 */
const route = createHistoryRoute({
  label: "Number Recall sessions",
  noun: "sessions",
  parse: (raw) => parseSessionData(raw, Date.now()),
  insert: (userId, data) => {
    const scored = scoreSession(data.config, data.rounds);
    return (
      db
        .insert(recallSessions)
        .values({
          userId,
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
        .onConflictDoNothing()
    );
  },
  recent: async (userId, limit) => {
    const rows = await db.select().from(recallSessions).where(eq(recallSessions.userId, userId)).orderBy(desc(recallSessions.endedAt)).limit(limit);
    return rows.map((r) => ({ clientId: r.clientId, startedAt: r.startedAt.getTime(), endedAt: r.endedAt.getTime(), config: r.config, rounds: r.rounds }));
  },
});

export const POST = route.POST;
export const GET = route.GET;
