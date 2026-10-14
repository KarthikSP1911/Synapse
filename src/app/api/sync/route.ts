import { NextResponse } from "next/server";
import { serverFailure } from "@/lib/http";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { readSyncBody } from "@/features/offline/lib/sync/body";
import { parseSyncBody, validateSession } from "@/features/offline/lib/sync/payload";
import { storeSyncedSession, type SyncedSession } from "@/features/offline/lib/sync/server";
import { practiceAnswerGrants, practiceBonusGrants } from "@/features/rewards/lib/grants";
import { dbRun } from "@/features/rewards/server/db-run";
import { creditGrants } from "@/features/rewards/server/wallet";

/**
 * Body: { sessions: [{ clientId, skill, mode, ..., startedAt, endedAt, pausedMs, attempts: [...] }] }
 * as JSON, optionally gzipped (`Content-Encoding: gzip`); see `src/features/offline/lib/sync/body.ts`.
 *
 * Receives practice that was done on the user's device (possibly offline) and stores it under their
 * account. Idempotent per session (`clientId`), so the browser can safely retry. Correctness is decided
 * here again from the raw answers; see `src/features/offline/lib/sync/payload.ts`.
 *
 * Coins: each correct answer, and the bonus for a session that ended, are credited here from the answers the server just
 * re-checked (never from anything the device claims), with keys made from the session and the answer, so a repeated upload
 * pays nothing twice.
 *
 * Reply: { synced: [{ clientId, id, stored }], rejected: [{ clientId, reason }] }.
 * A rejected session is permanently invalid (retrying cannot help); a server failure is a 5xx instead.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const read = await readSyncBody(request);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const parsed = parseSyncBody(read.body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const synced: SyncedSession[] = [];
  const rejected: { clientId: string | null; reason: string }[] = [];
  try {
    for (const raw of parsed.sessions) {
      const result = validateSession(raw);
      if (!result.ok) {
        rejected.push({ clientId: result.clientId, reason: result.reason });
        continue;
      }
      const stored = await storeSyncedSession(user.id, result.session);
      const { clientId, attempts, endedAt } = result.session;
      const answered = attempts.map((a) => ({ outcome: a.outcome, at: a.at, questionId: a.question.id }));
      await creditGrants(dbRun, user.id, [...practiceAnswerGrants(clientId, answered), ...practiceBonusGrants(clientId, answered, endedAt)]);
      // Reported as synced only once the coins are in too, so a failure here makes the device retry both (each is idempotent).
      synced.push(stored);
    }
  } catch (error) {
    // Sessions stored before the failure stay stored; the client retries the rest and the repeat is harmless.
    return serverFailure("Failed to sync", error, { route: "/api/sync", method: "POST", stored: synced.length, rejected: rejected.length }, { synced, rejected });
  }
  return NextResponse.json({ synced, rejected });
}
