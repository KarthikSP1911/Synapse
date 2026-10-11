import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createLocalFetch } from "@/lib/guest/api";
import { loadGuestData, saveGuestData, userStorageKey, MAX_GUEST_SESSIONS } from "@/lib/guest/storage";
import { IDLE_UPLOAD_MS, batches, pendingCount, syncUser, type SyncDeps } from "./client";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const USER = 7;
const KEY = userStorageKey(USER);
const store = { key: KEY, syncable: true };
const local = createLocalFetch(store);
const NOW = Date.now();

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

const post = (url: string, body?: unknown) =>
  local(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

async function playSession(answers = 3, finish = true): Promise<number> {
  const created = await post("/api/sessions", {
    skill: "multiplication",
    mode: "endless",
    config: { skill: "multiplication", left: [6], right: [7] },
  });
  const { id } = await created.json();
  for (let i = 0; i < answers; i++) {
    const res = await post(`/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", userAnswer: "42", responseTimeMs: 1000 + i });
    assert.equal(res.status, 200);
  }
  if (finish) await post(`/api/sessions/${id}/end`);
  return id;
}

interface Call {
  url: string;
  body: { sessions?: { clientId: string; attempts: unknown[] }[] } | null;
  /** The request's Content-Encoding header, if any. */
  encoding?: string;
}

/** The JSON a request carried, whether it was sent as text or gzipped. */
function bodyOf(init?: RequestInit): Call["body"] {
  const { body } = init ?? {};
  if (typeof body === "string") return JSON.parse(body);
  if (body instanceof Uint8Array) return JSON.parse(gunzipSync(body).toString("utf8"));
  return null;
}

/** A fake server: records calls, accepts every uploaded session, and serves a fixed stats snapshot. */
function fakeServer(options: { state?: unknown; failUpload?: boolean; refuseGzip?: boolean; onUpload?: () => void } = {}) {
  const calls: Call[] = [];
  const deps: SyncDeps = {
    now: () => NOW,
    fetch: (async (url: string, init?: RequestInit) => {
      const encoding = (init?.headers as Record<string, string> | undefined)?.["Content-Encoding"];
      const body = bodyOf(init);
      calls.push({ url, body, encoding });
      if (url === "/api/sync/state") {
        return Response.json(options.state ?? { userId: USER, stats: [] });
      }
      if (options.failUpload) return Response.json({ error: "boom" }, { status: 500 });
      // What an older deployment does with a body it cannot read.
      if (options.refuseGzip && encoding === "gzip") return Response.json({ error: "Expected { sessions: [...] }" }, { status: 400 });
      options.onUpload?.();
      return Response.json({
        synced: (body?.sessions ?? []).map((s) => ({ clientId: s.clientId, id: 1, stored: s.attempts.length })),
        rejected: [],
      });
    }) as typeof fetch,
  };
  return { calls, deps };
}

describe("local sessions for a signed-in user", () => {
  it("are flagged as waiting to upload, with a client id, and stay out of the guest store", async () => {
    const id = await playSession(2);
    const [session] = loadGuestData(KEY).sessions;
    assert.equal(session.id, id);
    assert.equal(session.synced, false);
    assert.match(session.clientId ?? "", /^[0-9a-f-]{36}$/);
    assert.equal(loadGuestData().sessions.length, 0);
    assert.equal(pendingCount(loadGuestData(KEY)), 1);
  });
});

describe("syncUser", () => {
  it("uploads finished sessions once and marks them uploaded", async () => {
    await playSession(3);
    const server = fakeServer();

    const first = await syncUser(USER, server.deps);
    assert.deepEqual(first, { ok: true, uploaded: 1, rejected: 0, pulledStats: true });
    const upload = server.calls.find((c) => c.url === "/api/sync");
    assert.equal(upload?.body?.sessions?.length, 1);
    assert.equal(upload?.body?.sessions?.[0].attempts.length, 3);
    assert.equal(loadGuestData(KEY).sessions[0].synced, true);

    const before = server.calls.length;
    const second = await syncUser(USER, server.deps);
    assert.equal(second.ok && second.uploaded, 0);
    assert.equal(server.calls.slice(before).filter((c) => c.url === "/api/sync").length, 0, "nothing left to upload");
  });

  it("sends a small upload as plain JSON", async () => {
    await playSession(2);
    const server = fakeServer();
    await syncUser(USER, server.deps);
    assert.equal(server.calls.find((c) => c.url === "/api/sync")?.encoding, undefined);
  });

  it("gzips a large upload, and the server still gets every attempt", async () => {
    await playSession(60);
    const server = fakeServer();
    const result = await syncUser(USER, server.deps);
    assert.deepEqual(result, { ok: true, uploaded: 1, rejected: 0, pulledStats: true });
    const upload = server.calls.find((c) => c.url === "/api/sync");
    assert.equal(upload?.encoding, "gzip");
    assert.equal(upload?.body?.sessions?.[0].attempts.length, 60);
    assert.equal(loadGuestData(KEY).sessions[0].synced, true);
  });

  it("sends the batch again as plain JSON when the server cannot read the gzipped one", async () => {
    await playSession(60);
    const server = fakeServer({ refuseGzip: true });
    const result = await syncUser(USER, server.deps);
    assert.deepEqual(result, { ok: true, uploaded: 1, rejected: 0, pulledStats: true });
    const uploads = server.calls.filter((c) => c.url === "/api/sync");
    assert.deepEqual(
      uploads.map((c) => c.encoding),
      ["gzip", undefined]
    );
    assert.equal(uploads[1].body?.sessions?.[0].attempts.length, 60);
    assert.equal(loadGuestData(KEY).sessions[0].synced, true);
  });

  it("keeps sessions flagged when the network or the server fails, and succeeds later", async () => {
    await playSession(2);
    const offline: SyncDeps = {
      now: () => NOW,
      fetch: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
    };
    assert.deepEqual(await syncUser(USER, offline), { ok: false, reason: "network", uploaded: 0 });
    assert.equal(loadGuestData(KEY).sessions[0].synced, false);

    const broken = fakeServer({ failUpload: true });
    assert.deepEqual(await syncUser(USER, broken.deps), { ok: false, reason: "server", uploaded: 0 });
    assert.equal(loadGuestData(KEY).sessions[0].synced, false);

    const working = fakeServer();
    assert.equal((await syncUser(USER, working.deps)).ok, true);
    assert.equal(loadGuestData(KEY).sessions[0].synced, true);
  });

  it("stops quietly when the user is signed out", async () => {
    await playSession(1);
    const deps: SyncDeps = { now: () => NOW, fetch: (async () => new Response("{}", { status: 401 })) as typeof fetch };
    assert.deepEqual(await syncUser(USER, deps), { ok: false, reason: "signed-out", uploaded: 0 });
    assert.equal(loadGuestData(KEY).sessions[0].synced, false);
  });

  it("does not mark a session uploaded if it changed while the upload was in flight", async () => {
    const id = await playSession(2, false);
    const server = fakeServer({
      onUpload: () => {
        // The user answers another question while the request is on its way.
        const data = loadGuestData(KEY);
        const session = data.sessions.find((s) => s.id === id)!;
        session.attempts.push({ ...session.attempts[0], at: session.attempts[0].at + 5 });
        session.actualQuestionCount += 1;
        session.endedAt = NOW;
        saveGuestData(data, KEY);
      },
    });
    // An unfinished session is only uploaded once it has been idle a while.
    const late: SyncDeps = { ...server.deps, now: () => NOW + IDLE_UPLOAD_MS + 1000 };
    await syncUser(USER, late);
    assert.equal(loadGuestData(KEY).sessions[0].synced, false, "the newer answer still has to be sent");
  });

  it("leaves an unfinished, recently active session alone until it has been idle", async () => {
    await playSession(2, false);
    const server = fakeServer();
    await syncUser(USER, server.deps);
    assert.equal(server.calls.filter((c) => c.url === "/api/sync").length, 0);

    const late: SyncDeps = { ...server.deps, now: () => NOW + IDLE_UPLOAD_MS + 60_000 };
    await syncUser(USER, late);
    assert.equal(server.calls.filter((c) => c.url === "/api/sync").length, 1);
  });

  it("replaces the device's statistics with the account's once nothing is waiting", async () => {
    await playSession(1);
    const stat = {
      questionId: "multiplication:6:7",
      skill: "multiplication",
      exerciseType: "multiply",
      concept: "multiplication:6",
      difficulty: "beginner",
      prompt: "6 × 7",
      totalAttempts: 9,
      correctAttempts: 9,
      incorrectAttempts: 0,
      hintedAttempts: 0,
      accuracy: 100,
      averageResponseTimeMs: 900,
      fastestResponseTimeMs: 800,
      slowestResponseTimeMs: 1000,
      currentCorrectStreak: 9,
      currentIncorrectStreak: 0,
      bestCorrectStreak: 9,
      weaknessScore: 5,
      box: 4,
      dueAt: null,
      lastAttemptedAt: NOW,
    };
    const server = fakeServer({ state: { userId: USER, stats: [stat] } });
    await syncUser(USER, server.deps);
    assert.equal(loadGuestData(KEY).stats["multiplication:6:7"].totalAttempts, 9);
    assert.equal(loadGuestData(KEY).userId, USER);
  });

  it("ignores a statistics snapshot that belongs to another account", async () => {
    const server = fakeServer({ state: { userId: 999, stats: [{ questionId: "x" }] } });
    const result = await syncUser(USER, server.deps);
    assert.equal(result.ok && result.pulledStats, false);
    assert.deepEqual(loadGuestData(KEY).stats, {});
  });
});

describe("batches", () => {
  it("splits sessions by count and by total attempts", async () => {
    for (let i = 0; i < 3; i++) await playSession(1);
    const sessions = loadGuestData(KEY).sessions;
    assert.equal(batches(sessions).length, 1);
    const fat = sessions.map((s) => ({ ...s, attempts: new Array(600).fill(s.attempts[0]) }));
    assert.deepEqual(batches(fat).map((b) => b.length), [1, 1, 1]);
    assert.deepEqual(batches([]), []);
  });
});

describe("storage trimming", () => {
  it("never drops a session the server has not received while older uploaded ones can go", async () => {
    for (let i = 0; i < MAX_GUEST_SESSIONS + 5; i++) await playSession(1);
    const data = loadGuestData(KEY);
    // Mark the oldest five as uploaded and add more: the unsynced ones all survive.
    data.sessions.slice(0, 5).forEach((s) => (s.synced = true));
    saveGuestData(data, KEY);
    await playSession(1);
    const after = loadGuestData(KEY);
    assert.equal(after.sessions.filter((s) => s.synced === false).length, MAX_GUEST_SESSIONS + 1);
    assert.equal(after.sessions.filter((s) => s.synced === true).length, 0);
  });
});
