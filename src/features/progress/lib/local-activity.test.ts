import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createLocalFetch } from "@/features/offline/lib/guest/api";
import { loadActivityDays } from "@/features/offline/lib/activity-days";
import { createLocalHistory } from "@/features/games/shared/lib/history/local";
import { evaluateSequence } from "@/features/games/mindsprint/lib/arithmetic";
import { PRESETS } from "@/features/games/mindsprint/lib/config";
import { generateRound } from "@/features/games/mindsprint/lib/generate";
import { loadHistory, markSynced, mergeRemote, saveSession } from "@/features/games/mindsprint/lib/storage";
import type { SessionData } from "@/features/games/mindsprint/lib/types";
import { seededRng } from "@/lib/random";
import { guestActivityDays, localActivityDays } from "./local-activity";
import { browserTimeZone, dayOf, summarizeStreaks } from "./streak";

// A minimal in-memory localStorage; node has none.
class MemoryStorage {
  items = new Map<string, string>();
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

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});
afterEach(() => mock.timers.reset());

const guest = { key: "mathz:guest:v1", syncable: false };
const account = { key: "mathz:user:v1:7", syncable: true };
const DAY = 24 * 60 * 60 * 1000;
const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const clock = (ms: number) => {
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: ms });
};
/** The day, in this browser's zone, that `ms` falls on: what a guest's record holds. */
const localDay = (ms: number) => dayOf(ms, browserTimeZone())!;

const guestApi = createLocalFetch(guest);
const accountApi = createLocalFetch(account);
type Api = typeof guestApi;

const post = (api: Api, url: string, body?: unknown) =>
  api(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

async function startSession(api: Api): Promise<number> {
  const res = await post(api, "/api/sessions", { skill: "multiplication", mode: "endless", config: { skill: "multiplication", left: [6], right: [7] } });
  assert.equal(res.status, 201);
  return (await res.json()).id;
}

const answer = async (api: Api, id: number, body: Record<string, unknown>) => {
  const res = await post(api, `/api/sessions/${id}/attempt`, { questionId: "multiplication:6:7", responseTimeMs: 1000, ...body });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
};

/** A saved MindSprint session that ended at `endedAt`. */
const sprint = (n: number, endedAt: number): SessionData => {
  const round = generateRound(PRESETS[0].round, seededRng(n));
  const result = evaluateSequence(round.flashes);
  assert.ok(result.ok);
  return { clientId: `client-${n}-abcdefgh`, startedAt: endedAt - 500, endedAt, rounds: [{ config: round.config, flashes: round.flashes, answer: result.answer, responseMs: 900 }] };
};

describe("practice activity", () => {
  it("counts an answered question, not opening or starting a session, a skip or a timeout", async () => {
    clock(noon("2026-10-13"));
    const id = await startSession(guestApi);
    assert.deepEqual(loadActivityDays(guest.key), [], "starting a session is not activity");

    await answer(guestApi, id, { outcome: "skipped" });
    assert.deepEqual(loadActivityDays(guest.key), [], "a skipped question is not activity");

    await answer(guestApi, id, { userAnswer: "41" });
    assert.deepEqual(loadActivityDays(guest.key), [localDay(noon("2026-10-13"))], "a wrong answer is still an answered question");

    await answer(guestApi, id, { userAnswer: "42" });
    assert.deepEqual(loadActivityDays(guest.key), [localDay(noon("2026-10-13"))], "more answers on the same day are still one day");
  });

  it("builds a guest's streak across days, and a missed day ends it", async () => {
    for (const day of ["2026-10-10", "2026-10-11", "2026-10-12"]) {
      clock(noon(day));
      await answer(guestApi, await startSession(guestApi), { userAnswer: "42" });
    }
    const days = guestActivityDays(guest);
    assert.equal(days.length, 3);
    assert.equal(summarizeStreaks(days, localDay(noon("2026-10-12"))).current, 3);
    assert.equal(summarizeStreaks(days, localDay(noon("2026-10-13"))).current, 3, "still alive on the next day until it ends");
    assert.equal(summarizeStreaks(days, localDay(noon("2026-10-14"))).current, 0, "a missed day ends the current streak");
    assert.equal(summarizeStreaks(days, localDay(noon("2026-10-14"))).longest, 3);
  });

  it("derives a signed-in user's days from their offline copy in the user's own zone", async () => {
    clock(Date.parse("2026-10-13T20:00:00Z"));
    await answer(accountApi, await startSession(accountApi), { userAnswer: "42" });
    assert.deepEqual(loadActivityDays(account.key), [], "an account keeps no day record of its own");
    assert.deepEqual([...localActivityDays(account, "UTC")], ["2026-10-13"]);
    assert.deepEqual([...localActivityDays(account, "Asia/Kolkata")], ["2026-10-14"]);
  });

  it("keeps a guest and an account apart", async () => {
    clock(noon("2026-10-13"));
    await answer(guestApi, await startSession(guestApi), { userAnswer: "42" });
    assert.equal(localActivityDays(account, "UTC").size, 0);
    assert.equal(localActivityDays(guest, "UTC").size, 1);

    clock(noon("2026-10-14"));
    await answer(accountApi, await startSession(accountApi), { userAnswer: "42" });
    assert.deepEqual([...localActivityDays(account, "UTC")], ["2026-10-14"]);
    assert.deepEqual([...localActivityDays(guest, "UTC")], ["2026-10-13"]);
  });
});

describe("game activity", () => {
  it("records a guest's day when a finished game is saved, once however often it is saved", () => {
    assert.equal(saveSession(guest, sprint(1, noon("2026-10-13"))), true);
    assert.equal(saveSession(guest, sprint(1, noon("2026-10-13"))), true);
    assert.equal(saveSession(guest, sprint(2, noon("2026-10-13") + 60_000)), true);
    assert.deepEqual(loadActivityDays(guest.key), [localDay(noon("2026-10-13"))]);
    assert.equal(loadHistory(guest).length, 2);
  });

  it("derives the same days from the saved sessions", () => {
    saveSession(account, sprint(1, noon("2026-10-12")));
    saveSession(account, sprint(2, noon("2026-10-13")));
    assert.deepEqual([...localActivityDays(account, "UTC")].sort(), ["2026-10-12", "2026-10-13"]);
  });

  it("does not note a day for a session the game's rule leaves out", () => {
    const history = createLocalHistory<{ clientId: string; startedAt: number; endedAt: number; ok: boolean }>({
      suffix: "rule-test",
      parse: (raw) => raw as never,
      countsAsActivity: (s) => s.ok,
    });
    history.save(guest, { clientId: "abandoned-abcdefgh", startedAt: 1, endedAt: noon("2026-10-12"), ok: false });
    assert.deepEqual(loadActivityDays(guest.key), []);
    history.save(guest, { clientId: "finished-abcdefgh", startedAt: 1, endedAt: noon("2026-10-13"), ok: true });
    assert.deepEqual(loadActivityDays(guest.key), [localDay(noon("2026-10-13"))]);
  });

  it("keeps a guest's streak after the device has dropped the old sessions", () => {
    const history = createLocalHistory<{ clientId: string; startedAt: number; endedAt: number }>({ suffix: "trim-test", parse: (raw) => raw as never });
    const first = noon("2026-01-01");
    for (let i = 0; i < 130; i++) history.save(guest, { clientId: `session-${i}-abcdefgh`, startedAt: first + i * DAY, endedAt: first + i * DAY + 1000 });

    assert.equal(history.load(guest).length, 100, "the device keeps only the latest 100 sessions");
    const days = loadActivityDays(guest.key);
    assert.equal(days.length, 130);
    assert.equal(summarizeStreaks(days, localDay(first + 129 * DAY)).longest, 130);
    assert.equal(summarizeStreaks(days, localDay(first + 129 * DAY)).current, 130);
  });
});

describe("guest days from sessions saved before the record existed", () => {
  it("are added once, and the record then stands on its own", () => {
    // Written straight to storage, the way an earlier version saved it: no day record.
    storage.setItem(`${guest.key}:mindsprint`, JSON.stringify([sprint(1, noon("2026-10-10")), sprint(2, noon("2026-10-11"))]));
    assert.deepEqual(loadActivityDays(guest.key), []);

    assert.deepEqual(guestActivityDays(guest), [localDay(noon("2026-10-10")), localDay(noon("2026-10-11"))]);

    saveSession(guest, sprint(3, noon("2026-10-12")));
    storage.items.delete(`${guest.key}:mindsprint`); // the history can vanish, the streak stays
    assert.deepEqual(guestActivityDays(guest), [localDay(noon("2026-10-10")), localDay(noon("2026-10-11")), localDay(noon("2026-10-12"))]);
  });
});

describe("signed-in streaks merge the account's days with the device's", () => {
  const user = "Asia/Kolkata";
  const serverDays = ["2026-10-10", "2026-10-11"];
  const union = (...lists: Iterable<string>[]) => lists.flatMap((l) => [...l]);

  it("counts a day the server and the device both know once", () => {
    // Two sessions the account already holds, still on the device too.
    saveSession(account, sprint(1, noon("2026-10-10")));
    saveSession(account, sprint(2, noon("2026-10-11")));
    markSynced(account, [sprint(1, 0).clientId, sprint(2, 0).clientId]);

    const merged = union(serverDays, localActivityDays(account, user));
    assert.equal(new Set(merged).size, 2);
    assert.deepEqual(summarizeStreaks(merged, "2026-10-11"), summarizeStreaks(serverDays, "2026-10-11"));
  });

  it("adds a day played offline that has not been uploaded yet", () => {
    saveSession(account, sprint(3, noon("2026-10-12")));
    const merged = union(serverDays, localActivityDays(account, user));
    assert.equal(summarizeStreaks(merged, "2026-10-12").current, 3, "the offline day extends the streak the server knows");
    assert.equal(summarizeStreaks(serverDays, "2026-10-12").current, 2, "without it the server's days stop at yesterday");
  });

  it("is not changed by uploading, nor by pulling history from another device", () => {
    saveSession(account, sprint(1, noon("2026-10-10")));
    const before = [...localActivityDays(account, user)].sort();

    markSynced(account, [sprint(1, 0).clientId]);
    assert.deepEqual([...localActivityDays(account, user)].sort(), before, "marking as uploaded changes nothing");

    mergeRemote(account, [sprint(9, noon("2026-10-08"))]);
    assert.deepEqual([...localActivityDays(account, user)].sort(), ["2026-10-08", ...before]);
    mergeRemote(account, [sprint(9, noon("2026-10-08"))]);
    assert.equal(localActivityDays(account, user).size, 2, "pulling the same session again adds nothing");
  });

  it("uses the user's zone on both sides so midnight lands on the same day", () => {
    // 20:00 UTC is 01:30 the next day in Kolkata. The server buckets with the user's zone, so must the device.
    saveSession(account, sprint(1, Date.parse("2026-10-10T20:00:00Z")));
    assert.deepEqual([...localActivityDays(account, user)], ["2026-10-11"]);
    assert.deepEqual([...localActivityDays(account, "UTC")], ["2026-10-10"]);
  });
});
