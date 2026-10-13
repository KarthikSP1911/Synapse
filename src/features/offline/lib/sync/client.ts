import { GZIP_MIN_CHARS, gzipText } from "@/features/offline/lib/compression";
import { loadGuestData, saveGuestData, userStorageKey, type GuestData, type GuestSession, type GuestStat } from "@/features/offline/lib/guest/storage";
import { MAX_SYNC_ATTEMPTS, MAX_SYNC_SESSIONS } from "@/features/offline/lib/sync/payload";

/**
 * Browser side of syncing. A signed-in user's practice is saved on the device first (see
 * `src/features/offline/lib/guest/api.ts`); this uploads the sessions the server has not received and refreshes the
 * device's copy of the account's statistics. Everything here is safe to repeat and to interrupt: the
 * server recognises sessions it already has, and a session is only marked uploaded after the server says so.
 */

/** A session that was left unfinished this long ago is treated as abandoned and uploaded as it stands. */
export const IDLE_UPLOAD_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20000;

export interface SyncDeps {
  fetch: typeof fetch;
  now: () => number;
}

const defaultDeps = (): SyncDeps => ({ fetch: (...args) => fetch(...args), now: () => Date.now() });

type SyncOutcome =
  | { ok: true; uploaded: number; rejected: number; pulledStats: boolean }
  | { ok: false; reason: "signed-out" | "network" | "server"; uploaded: number };

/** When the session last changed: its newest attempt, or its start. */
const lastActivity = (s: GuestSession) => s.attempts.reduce((latest, a) => Math.max(latest, a.at), s.endedAt ?? s.startedAt);

/** A cheap fingerprint of everything an upload carries, to tell whether a session changed while its upload was in flight. */
const fingerprint = (s: GuestSession) => `${s.attempts.length}:${s.actualQuestionCount}:${s.endedAt}:${s.pausedMs}:${s.pausedAt}`;

/** Sessions waiting to be uploaded (`synced: false`), ignoring one still being played. */
function readyToUpload(data: GuestData, now: number): GuestSession[] {
  return data.sessions.filter((s) => s.synced === false && s.clientId && (s.endedAt !== null || now - lastActivity(s) > IDLE_UPLOAD_MS));
}

/** How many sessions have not reached the server yet (including one in progress). */
export const pendingCount = (data: GuestData): number => data.sessions.filter((s) => s.synced === false && s.attempts.length > 0).length;

export const pendingCountFor = (userId: number): number => pendingCount(loadGuestData(userStorageKey(userId)));

function payloadFor(s: GuestSession) {
  return {
    clientId: s.clientId,
    skill: s.skill,
    mode: s.mode,
    focus: s.focus,
    config: s.config,
    targetQuestionCount: s.targetQuestionCount,
    durationSeconds: s.durationSeconds,
    questionTimeLimitSeconds: s.questionTimeLimitSeconds ?? 0,
    weakFocusPercent: s.weakFocusPercent,
    recentWindow: s.recentWindow,
    questionList: s.questionList,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    pausedMs: s.pausedMs,
    attempts: s.attempts.map((a) => ({
      questionId: a.questionId,
      userAnswerText: a.userAnswerText,
      outcome: a.outcome,
      hinted: a.hinted,
      responseTimeMs: a.responseTimeMs,
      at: a.at,
    })),
  };
}

/** Groups sessions into requests the server accepts (bounded by session count and total attempts). */
export function batches(sessions: GuestSession[]): GuestSession[][] {
  const out: GuestSession[][] = [];
  let current: GuestSession[] = [];
  let attempts = 0;
  for (const s of sessions) {
    if (current.length > 0 && (current.length >= MAX_SYNC_SESSIONS || attempts + s.attempts.length > MAX_SYNC_ATTEMPTS)) {
      out.push(current);
      current = [];
      attempts = 0;
    }
    current.push(s);
    attempts += s.attempts.length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Uploads the batch, gzipped when that makes it smaller. An offline backlog is the largest thing this app
 * ever sends, and it is typically sent over a weak connection. Should the server refuse the compressed
 * form (for example an older deployment behind this page), the same batch is sent once more as plain JSON.
 */
async function upload(deps: SyncDeps, payload: unknown): Promise<Response> {
  const text = JSON.stringify(payload);
  const send = (body: BodyInit, headers: Record<string, string>) =>
    request(deps, "/api/sync", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });

  const packed = text.length >= GZIP_MIN_CHARS ? await gzipText(text) : null;
  if (!packed || packed.length >= text.length) return send(text, {});

  const res = await send(packed as BodyInit, { "Content-Encoding": "gzip" });
  return res.status === 400 || res.status === 415 ? send(text, {}) : res;
}

async function request(deps: SyncDeps, url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await deps.fetch(url, { ...init, signal: controller.signal, cache: "no-store", credentials: "same-origin" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uploads what the server is missing, then (once nothing is waiting) replaces the device's copy of the
 * account's statistics with the server's. Never throws: failures are reported in the result so the
 * caller can retry later.
 */
export async function syncUser(userId: number, deps: SyncDeps = defaultDeps()): Promise<SyncOutcome> {
  const key = userStorageKey(userId);
  let uploaded = 0;
  let rejectedCount = 0;

  try {
    const snapshot = loadGuestData(key);
    // Empty sessions (opened and abandoned before the first answer) carry nothing worth uploading.
    const empty = snapshot.sessions.filter(
      (s) => s.synced === false && s.attempts.length === 0 && (s.endedAt !== null || deps.now() - lastActivity(s) > IDLE_UPLOAD_MS)
    );
    if (empty.length > 0) {
      for (const s of empty) s.synced = true;
      saveGuestData(snapshot, key);
    }

    for (const batch of batches(readyToUpload(loadGuestData(key), deps.now()).filter((s) => s.attempts.length > 0))) {
      const sent = new Map(batch.map((s) => [s.clientId as string, fingerprint(s)]));
      const res = await upload(deps, { sessions: batch.map(payloadFor) });
      if (res.status === 401) return { ok: false, reason: "signed-out", uploaded };
      const body: { synced?: { clientId: string }[]; rejected?: { clientId: string | null }[] } = await res.json().catch(() => ({}));
      if (!res.ok && !body.synced?.length) return { ok: false, reason: "server", uploaded };

      // Re-read: the user may have kept practising while the request was in flight.
      const fresh = loadGuestData(key);
      const done = new Set([...(body.synced ?? []).map((r) => r.clientId), ...(body.rejected ?? []).flatMap((r) => (r.clientId ? [r.clientId] : []))]);
      for (const s of fresh.sessions) {
        if (s.clientId && done.has(s.clientId) && sent.get(s.clientId) === fingerprint(s)) s.synced = true;
      }
      saveGuestData(fresh, key);
      uploaded += body.synced?.length ?? 0;
      rejectedCount += body.rejected?.length ?? 0;
      if (!res.ok) return { ok: false, reason: "server", uploaded };
    }

    let pulledStats = false;
    if (loadGuestData(key).sessions.every((s) => s.synced !== false)) {
      pulledStats = await pullStats(userId, deps);
    }
    return { ok: true, uploaded, rejected: rejectedCount, pulledStats };
  } catch {
    // Offline, timed out or aborted: whatever was not confirmed stays flagged and is retried next time.
    return { ok: false, reason: "network", uploaded };
  }
}

/** Replaces the device's per-question statistics with the account's. Only called when nothing local is waiting to upload. */
async function pullStats(userId: number, deps: SyncDeps): Promise<boolean> {
  const res = await request(deps, "/api/sync/state");
  if (!res.ok) return false;
  const body: { userId?: number; stats?: GuestStat[] } = await res.json().catch(() => ({}));
  if (body.userId !== userId || !Array.isArray(body.stats)) return false;

  const key = userStorageKey(userId);
  const data = loadGuestData(key);
  // Practice that started while the snapshot was on its way is newer than the snapshot: keep the local figures.
  if (data.sessions.some((s) => s.synced === false)) return false;
  data.userId = userId;
  data.stats = Object.fromEntries(body.stats.map((s) => [s.questionId, s]));
  return saveGuestData(data, key);
}
