import type { LocalStore } from "@/lib/guest/api";
import { DEFAULT_ROUND, DEFAULT_ROUND_COUNT, parseSetup } from "./config";
import { parseSessionData } from "./records";
import type { RoundConfig, SessionData } from "./types";

/**
 * MindSprint history on this device, next to (but separate from) the practice history, under the same
 * per-viewer key: a guest's stays in the browser for good, a signed-in user's is the offline copy of their
 * account and is uploaded by `./sync.ts`. Sessions are small, so plain JSON is enough.
 *
 * Only finished sessions are saved. A session abandoned half way leaves no trace.
 */

/** Oldest sessions beyond this are dropped from the device (never one that has not been uploaded yet, up to a hard cap). */
export const MAX_STORED_SESSIONS = 100;
const MAX_UNSYNCED_SESSIONS = 300;

export interface StoredSession extends SessionData {
  /** Signed-in stores only: false until the server has confirmed it holds this session. */
  synced?: boolean;
}

/** The key for a store whose practice history lives under `storeKey` (`mathz:user:v1:5` becomes `mathz:user:v1:5:mindsprint`). */
export const historyKeyFor = (storeKey: string): string => `${storeKey}:mindsprint`;
export const historyKey = (store: LocalStore): string => historyKeyFor(store.key);

function read(key: string): StoredSession[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const sessions: StoredSession[] = [];
    for (const item of raw) {
      const parsed = parseSessionData(item);
      if (!parsed.ok) continue;
      const synced = (item as { synced?: unknown }).synced;
      sessions.push(synced === false ? { ...parsed.data, synced: false } : parsed.data);
    }
    return sessions.sort((a, b) => a.startedAt - b.startedAt);
  } catch {
    // Storage unavailable or corrupt: start empty.
    return [];
  }
}

function write(key: string, sessions: StoredSession[]): boolean {
  const trimmed = trim(sessions);
  try {
    localStorage.setItem(key, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

function trim(sessions: StoredSession[]): StoredSession[] {
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

/** How many sessions under this key still have to be uploaded. */
export const pendingCountAt = (key: string): number => read(key).filter((s) => s.synced === false).length;

export const loadHistory = (store: LocalStore): StoredSession[] => read(historyKey(store));

/** Saves a finished session. Safe to repeat: a session already stored (same client id) is left as it is. Returns false if the browser refused. */
export function saveSession(store: LocalStore, data: SessionData): boolean {
  const key = historyKey(store);
  const sessions = read(key);
  if (sessions.some((s) => s.clientId === data.clientId)) return true;
  sessions.push(store.syncable ? { ...data, synced: false } : data);
  return write(key, sessions);
}

/** Sessions the server has not confirmed yet. */
export const pendingSessions = (store: LocalStore): StoredSession[] => (store.syncable ? loadHistory(store).filter((s) => s.synced === false) : []);

/** Marks sessions as uploaded. Re-reads first, so a session saved while the upload was in flight is not lost. */
export function markSynced(store: LocalStore, clientIds: readonly string[]): void {
  const key = historyKey(store);
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
}

/** Adds sessions the account holds that this device does not (history from another device), already marked as uploaded. */
export function mergeRemote(store: LocalStore, remote: readonly SessionData[]): number {
  const key = historyKey(store);
  const sessions = read(key);
  const have = new Set(sessions.map((s) => s.clientId));
  const fresh = remote.filter((s) => !have.has(s.clientId));
  if (fresh.length === 0) return 0;
  write(key, [...sessions, ...fresh].sort((a, b) => a.startedAt - b.startedAt));
  return fresh.length;
}

// ---------------------------------------------------------------------------
// Remembered setup
// ---------------------------------------------------------------------------

const SETUP_KEY = "mathz:mindsprint:setup";
const SOUND_KEY = "mathz:mindsprint:sound";

export const defaultSetup = (): RoundConfig[] => Array.from({ length: DEFAULT_ROUND_COUNT }, () => ({ ...DEFAULT_ROUND, operations: [...DEFAULT_ROUND.operations] }));

/** The rounds the player last set up, or the defaults. */
export function loadSetup(): RoundConfig[] {
  try {
    return parseSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null")) ?? defaultSetup();
  } catch {
    return defaultSetup();
  }
}

export function saveSetup(rounds: readonly RoundConfig[]): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(rounds));
  } catch {
    // Remembering the setup is a convenience only.
  }
}

export function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSound(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Remembering the choice is a convenience only.
  }
}
