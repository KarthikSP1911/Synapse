import type { LocalStore } from "@/features/offline/lib/guest/api";
import { userStorageKey } from "@/features/offline/lib/guest/storage";
import type { HistoryItem, createLocalHistory } from "./local";
import { MAX_UPLOAD_SESSIONS } from "./upload";

/**
 * Browser side of syncing a game's history for a signed-in user, in the same spirit as `src/features/offline/lib/sync/client.ts`
 * for practice: finished sessions are saved on the device first, uploaded when there is a connection, and only
 * marked as uploaded once the server says it has them. The server recognises a session it already has by its
 * client id, so repeating or interrupting an upload is harmless.
 */

const REQUEST_TIMEOUT_MS = 20000;

export type HistorySyncResult = { ok: true; uploaded: number; pulled: number } | { ok: false; reason: "signed-out" | "network" | "server"; uploaded: number };

async function request(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(url, { ...init, signal: controller.signal, cache: "no-store", credentials: "same-origin" });
  } finally {
    clearTimeout(timer);
  }
}

export interface HistorySyncOptions<T extends HistoryItem> {
  history: ReturnType<typeof createLocalHistory<T>>;
  /** e.g. `/api/sync/mindsprint`: POST takes `{ sessions }`, GET returns `{ sessions }`. */
  endpoint: string;
  /** A strictly validated copy of a session received from the server, or null. */
  parse: (raw: unknown) => T | null;
  /** What is sent for a session (leaves out device-only fields). */
  payload: (session: T) => unknown;
}

export function createHistorySync<T extends HistoryItem>({ history, endpoint, parse, payload }: HistorySyncOptions<T>) {
  const storeFor = (userId: number): LocalStore => ({ key: userStorageKey(userId), syncable: true });

  return {
    pendingCountFor: (userId: number): number => history.pendingCountAt(userStorageKey(userId)),

    /**
     * Uploads the sessions the server is missing and, with `pull`, adds the account's sessions from other devices
     * to this one. Never throws: the outcome says whether to try again later.
     */
    async sync(userId: number, { pull = false, fetcher = (...args) => fetch(...args) }: { pull?: boolean; fetcher?: typeof fetch } = {}): Promise<HistorySyncResult> {
      const store = storeFor(userId);
      let uploaded = 0;
      try {
        const waiting = history.pending(store);
        for (let i = 0; i < waiting.length; i += MAX_UPLOAD_SESSIONS) {
          const batch = waiting.slice(i, i + MAX_UPLOAD_SESSIONS).map(payload);
          const res = await request(fetcher, endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessions: batch }) });
          if (res.status === 401) return { ok: false, reason: "signed-out", uploaded };
          const body: { synced?: { clientId: string }[]; rejected?: { clientId: string | null }[] } = await res.json().catch(() => ({}));
          if (!res.ok && !body.synced?.length) return { ok: false, reason: "server", uploaded };
          // A rejected session can never be accepted, so it is marked too instead of being retried forever.
          history.markSynced(store, [...(body.synced ?? []).map((r) => r.clientId), ...(body.rejected ?? []).flatMap((r) => (r.clientId ? [r.clientId] : []))]);
          uploaded += body.synced?.length ?? 0;
          if (!res.ok) return { ok: false, reason: "server", uploaded };
        }

        let pulled = 0;
        if (pull && history.pending(store).length === 0) {
          const res = await request(fetcher, endpoint);
          if (res.status === 401) return { ok: false, reason: "signed-out", uploaded };
          if (!res.ok) return { ok: false, reason: "server", uploaded };
          const body: { sessions?: unknown[] } = await res.json().catch(() => ({}));
          pulled = history.mergeRemote(
            store,
            (body.sessions ?? []).flatMap((raw) => {
              const data = parse(raw);
              return data ? [data] : [];
            })
          );
        }
        return { ok: true, uploaded, pulled };
      } catch {
        // Offline, timed out or aborted: whatever was not confirmed stays flagged and is retried next time.
        return { ok: false, reason: "network", uploaded };
      }
    },
  };
}
