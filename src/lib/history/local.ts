import type { LocalStore } from "@/lib/guest/api";

/**
 * Finished-game history on this device, shared by the games that keep their own history (MindSprint, Number
 * Recall). It lives next to the practice history under the same per-viewer key, with a suffix per game: a guest's
 * stays in the browser for good, a signed-in user's is the offline copy of their account and is uploaded by
 * `./sync.ts`. Sessions are small, so plain JSON is enough. Only finished sessions are saved.
 */

/** Oldest sessions beyond this are dropped from the device (never one that has not been uploaded yet, up to a hard cap). */
export const MAX_STORED_SESSIONS = 100;
const MAX_UNSYNCED_SESSIONS = 300;

export interface HistoryItem {
  /** Random id that makes uploads idempotent. */
  clientId: string;
  startedAt: number;
  endedAt: number;
}

/** A stored session; `synced: false` marks one the server has not confirmed yet (signed-in stores only). */
export type Stored<T> = T & { synced?: false };

export interface LocalHistoryOptions<T extends HistoryItem> {
  /** Appended to the store's key: `mathz:user:v1:5` becomes `mathz:user:v1:5:<suffix>`. */
  suffix: string;
  /** A strictly validated copy of untrusted stored data, or null if it is not a valid session. */
  parse: (raw: unknown) => T | null;
}

export function createLocalHistory<T extends HistoryItem>({ suffix, parse }: LocalHistoryOptions<T>) {
  const keyFor = (storeKey: string): string => `${storeKey}:${suffix}`;

  function read(key: string): Stored<T>[] {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(raw)) return [];
      const sessions: Stored<T>[] = [];
      for (const item of raw) {
        const data = parse(item);
        if (!data) continue;
        sessions.push((item as { synced?: unknown }).synced === false ? { ...data, synced: false } : data);
      }
      return sessions.sort((a, b) => a.startedAt - b.startedAt);
    } catch {
      // Storage unavailable or corrupt: start empty.
      return [];
    }
  }

  function trim(sessions: Stored<T>[]): Stored<T>[] {
    if (sessions.length <= MAX_STORED_SESSIONS) return sessions;
    let excess = sessions.length - MAX_STORED_SESSIONS;
    const kept = sessions.filter((s) => {
      if (excess > 0 && s.synced !== false) {
        excess -= 1;
        return false;
      }
      return true;
    });
    return kept.length > MAX_UNSYNCED_SESSIONS ? kept.slice(-MAX_UNSYNCED_SESSIONS) : kept;
  }

  function write(key: string, sessions: Stored<T>[]): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(trim(sessions)));
      return true;
    } catch {
      return false;
    }
  }

  const load = (store: LocalStore): Stored<T>[] => read(keyFor(store.key));

  return {
    keyFor,
    load,

    /** How many sessions under this store key still have to be uploaded. */
    pendingCountAt: (storeKey: string): number => read(keyFor(storeKey)).filter((s) => s.synced === false).length,

    /** Saves a finished session. Safe to repeat: one already stored (same client id) is left as it is. Returns false if the browser refused. */
    save(store: LocalStore, data: T): boolean {
      const key = keyFor(store.key);
      const sessions = read(key);
      if (sessions.some((s) => s.clientId === data.clientId)) return true;
      sessions.push(store.syncable ? { ...data, synced: false } : data);
      return write(key, sessions);
    },

    /** Sessions the server has not confirmed yet. */
    pending: (store: LocalStore): Stored<T>[] => (store.syncable ? load(store).filter((s) => s.synced === false) : []),

    /** Marks sessions as uploaded. Re-reads first, so a session saved while the upload was in flight is not lost. */
    markSynced(store: LocalStore, clientIds: readonly string[]): void {
      const key = keyFor(store.key);
      const done = new Set(clientIds);
      write(
        key,
        read(key).map((s) => {
          if (!done.has(s.clientId)) return s;
          const uploaded = { ...s };
          delete uploaded.synced;
          return uploaded;
        })
      );
    },

    /** Adds sessions the account holds that this device does not (history from another device), already marked as uploaded. */
    mergeRemote(store: LocalStore, remote: readonly T[]): number {
      const key = keyFor(store.key);
      const sessions = read(key);
      const have = new Set(sessions.map((s) => s.clientId));
      const fresh = remote.filter((s) => !have.has(s.clientId));
      if (fresh.length === 0) return 0;
      write(key, [...sessions, ...fresh].sort((a, b) => a.startedAt - b.startedAt));
      return fresh.length;
    },
  };
}
