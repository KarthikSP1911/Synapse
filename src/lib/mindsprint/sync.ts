import { userStorageKey } from "@/lib/guest/storage";
import type { LocalStore } from "@/lib/guest/api";
import { MAX_UPLOAD_SESSIONS, parseSessionData } from "./records";
import { historyKeyFor, markSynced, mergeRemote, pendingCountAt, pendingSessions } from "./storage";

/**
 * Browser side of syncing MindSprint history for a signed-in user, in the same spirit as `src/lib/sync/client.ts`
 * for practice: finished sessions are saved on the device first, uploaded when there is a connection, and only
 * marked as uploaded once the server says it has them. The server recognises a session it already has by its
 * client id, so repeating or interrupting an upload is harmless.
 */

const REQUEST_TIMEOUT_MS = 20000;

export const pendingCountFor = (userId: number): number => pendingCountAt(historyKeyFor(userStorageKey(userId)));

export type MindsprintSyncResult = { ok: true; uploaded: number; pulled: number } | { ok: false; reason: "signed-out" | "network" | "server"; uploaded: number };

async function request(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(url, { ...init, signal: controller.signal, cache: "no-store", credentials: "same-origin" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uploads the sessions the server is missing and, with `pull`, adds the account's sessions from other devices to
 * this one. Never throws: the outcome says whether to try again later.
 */
export async function syncMindsprint(userId: number, { pull = false, fetcher = (...args) => fetch(...args) }: { pull?: boolean; fetcher?: typeof fetch } = {}): Promise<MindsprintSyncResult> {
  const store: LocalStore = { key: userStorageKey(userId), syncable: true };
  let uploaded = 0;
  try {
    const waiting = pendingSessions(store);
    for (let i = 0; i < waiting.length; i += MAX_UPLOAD_SESSIONS) {
      const batch = waiting.slice(i, i + MAX_UPLOAD_SESSIONS).map((s) => ({ clientId: s.clientId, startedAt: s.startedAt, endedAt: s.endedAt, rounds: s.rounds }));
      const res = await request(fetcher, "/api/sync/mindsprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: batch }),
      });
      if (res.status === 401) return { ok: false, reason: "signed-out", uploaded };
      const body: { synced?: { clientId: string }[]; rejected?: { clientId: string | null }[] } = await res.json().catch(() => ({}));
      if (!res.ok && !body.synced?.length) return { ok: false, reason: "server", uploaded };
      // A rejected session can never be accepted, so it is marked too instead of being retried forever.
      const done = [...(body.synced ?? []).map((r) => r.clientId), ...(body.rejected ?? []).flatMap((r) => (r.clientId ? [r.clientId] : []))];
      markSynced(store, done);
      uploaded += body.synced?.length ?? 0;
      if (!res.ok) return { ok: false, reason: "server", uploaded };
    }

    let pulled = 0;
    if (pull && pendingSessions(store).length === 0) {
      const res = await request(fetcher, "/api/sync/mindsprint");
      if (res.status === 401) return { ok: false, reason: "signed-out", uploaded };
      if (!res.ok) return { ok: false, reason: "server", uploaded };
      const body: { sessions?: unknown[] } = await res.json().catch(() => ({}));
      const valid = (body.sessions ?? []).flatMap((raw) => {
        const parsed = parseSessionData(raw);
        return parsed.ok ? [parsed.data] : [];
      });
      pulled = mergeRemote(store, valid);
    }
    return { ok: true, uploaded, pulled };
  } catch {
    // Offline, timed out or aborted: whatever was not confirmed stays flagged and is retried next time.
    return { ok: false, reason: "network", uploaded };
  }
}
