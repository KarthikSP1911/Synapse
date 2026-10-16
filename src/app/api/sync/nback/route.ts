import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { nbackSessions } from "@/db/schema";
import { createHistoryRoute } from "@/features/games/shared/lib/history/route";
import { analyze } from "@/features/games/nback/lib/analysis";
import { activeStreams } from "@/features/games/nback/lib/config";
import { parseSessionData } from "@/features/games/nback/lib/records";
import { sessionGrants } from "@/features/games/nback/lib/rewards";

export const dynamic = "force-dynamic";

/**
 * Body: { sessions: [{ clientId, startedAt, endedAt, outcome, config, seed, generator, responses, durationMs }] }
 *
 * Stores N-Back sessions that ended on the user's device (possibly offline): played to the end, or ended by Game
 * Over. Idempotent per session (`clientId`), so the browser can safely retry. Nothing the browser says about the
 * result is used: the sequence is rebuilt from the seed, the responses are replayed through the scorer, and the
 * outcome has to match what that gives. Lives, accuracy, points and the coin reward are all worked out here.
 *
 * GET returns the account's latest sessions, so a device can show history played elsewhere.
 * See `createHistoryRoute` for the reply shapes.
 */
const route = createHistoryRoute({
  label: "N-Back sessions",
  noun: "sessions",
  parse: (raw) => parseSessionData(raw, { now: Date.now(), verify: true }),
  grants: sessionGrants,
  insert: (userId, data) => {
    const { result, points } = analyze(data);
    return (
      db
        .insert(nbackSessions)
        .values({
          userId,
          clientId: data.clientId,
          outcome: data.outcome,
          config: data.config,
          seed: data.seed,
          generator: data.generator,
          responses: data.responses,
          durationMs: data.durationMs,
          n: data.config.n,
          streamCount: activeStreams(data.config).length,
          trialsPlayed: result.trialsPlayed,
          livesLeft: result.livesRemaining,
          accuracy: Math.round(result.overall.accuracy),
          score: points,
          startedAt: new Date(data.startedAt),
          endedAt: new Date(data.endedAt),
        })
        // The same session sent twice (a retry, or two tabs): the first one stays.
        .onConflictDoNothing()
    );
  },
  recent: async (userId, limit) => {
    const rows = await db.select().from(nbackSessions).where(eq(nbackSessions.userId, userId)).orderBy(desc(nbackSessions.endedAt)).limit(limit);
    return rows.map((r) => ({
      clientId: r.clientId,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt.getTime(),
      outcome: r.outcome,
      config: r.config,
      seed: r.seed,
      generator: r.generator,
      responses: r.responses,
      durationMs: r.durationMs,
    }));
  },
});

export const POST = route.POST;
export const GET = route.GET;
