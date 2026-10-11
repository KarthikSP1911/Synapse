import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { parseSyncBody, validateSession } from "@/lib/sync/payload";
import { storeSyncedSession, type SyncedSession } from "@/lib/sync/server";
import { readJson } from "@/lib/validation";

/**
 * Body: { sessions: [{ clientId, skill, mode, ..., startedAt, endedAt, pausedMs, attempts: [...] }] }
 *
 * Receives practice that was done on the user's device (possibly offline) and stores it under their
 * account. Idempotent per session (`clientId`), so the browser can safely retry. Correctness is decided
 * here again from the raw answers; see `src/lib/sync/payload.ts`.
 *
 * Reply: { synced: [{ clientId, id, stored }], rejected: [{ clientId, reason }] }.
 * A rejected session is permanently invalid (retrying cannot help); a server failure is a 5xx instead.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const body = await readJson(request);
  const parsed = parseSyncBody(body);
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
      synced.push(await storeSyncedSession(user.id, result.session));
    }
  } catch (error) {
    // Sessions stored before the failure stay stored; the client retries the rest and the repeat is harmless.
    console.error("Failed to sync sessions:", error);
    return NextResponse.json({ error: "Failed to sync", synced, rejected }, { status: 500 });
  }
  return NextResponse.json({ synced, rejected });
}
