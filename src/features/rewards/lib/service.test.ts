import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLocalFetch, GUEST_STORE, type LocalStore } from "@/features/offline/lib/guest/api";
import { createLocalHistory } from "@/features/games/shared/lib/history/local";
import { questionFromId } from "@/features/skills/lib/build";
import { balanceOf } from "./ledger";
import { awardGrants, buyShieldLocally, hintCooldownLeft, protectStreakLocally, requestHint } from "./service";
import { loadWallet, parseWallet, walletKey } from "./wallet-store";
import type { Grant } from "./types";

class MemoryStorage {
  items = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

let storage: MemoryStorage;
const realNow = Date.now;
let clock = 1_800_000_000_000;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  clock = 1_800_000_000_000;
  Date.now = () => clock;
});
afterEach(() => {
  Date.now = realNow;
});

const guest: LocalStore = GUEST_STORE;
const account: LocalStore = { key: "mathz:user:v1:7", syncable: true };
const grant = (amount: number, key: string): Grant => ({ key, amount, reason: "test", ref: "r", at: clock });
const balance = (store: LocalStore) => balanceOf(loadWallet(store));
const fund = (store: LocalStore, coins: number) => awardGrants(store, [grant(coins, `fund:${store.key}`)]);

describe("the wallet on this device", () => {
  it("keeps coins across a reload, because they are read back from storage", () => {
    awardGrants(guest, [grant(2, "a"), grant(5, "b")]);
    assert.equal(balance(guest), 7);
    assert.ok(storage.items.has(walletKey(guest)));
    assert.equal(parseWallet(JSON.parse(storage.items.get(walletKey(guest))!), guest.key).entries.length, 2);
  });

  it("pays a key once even when asked repeatedly (retries, re-renders)", () => {
    for (let i = 0; i < 5; i++) awardGrants(guest, [grant(2, "same")]);
    assert.equal(balance(guest), 2);
    assert.equal(loadWallet(guest).entries.length, 1);
  });

  it("gives a guest and an account separate wallets", () => {
    awardGrants(guest, [grant(10, "g")]);
    awardGrants(account, [grant(3, "u")]);
    assert.equal(balance(guest), 10);
    assert.equal(balance(account), 3);
    assert.equal(loadWallet(account).entries[0].pending, true, "an account's coins wait for the server to confirm them");
    assert.equal(loadWallet(guest).entries[0].pending, undefined);
  });

  it("pays nothing, and leaves the balance alone, when the browser refuses to save", () => {
    awardGrants(guest, [grant(2, "a")]);
    storage.failWrites = true;
    assert.deepEqual(awardGrants(guest, [grant(100, "b")]), []);
    storage.failWrites = false;
    assert.equal(balance(guest), 2);
  });

  it("ignores a damaged or foreign stored wallet instead of crashing", () => {
    storage.items.set(walletKey(guest), "{not json");
    assert.equal(balance(guest), 0);
    storage.items.set(walletKey(guest), JSON.stringify({ v: 1, owner: "someone-else", baseCoins: 999, entries: [] }));
    assert.equal(balance(guest), 0, "another viewer's wallet is not read");
  });

  it("never reads a negative balance from edited storage, and rebuilds each balance-after", () => {
    const tampered = {
      v: 1,
      owner: guest.key,
      baseCoins: -50,
      entries: [{ id: "x", key: "k", type: "earning", amount: 3, shields: 0, reason: "r", ref: null, at: 5, balanceAfter: 9999 }, { id: "y", key: "bad key", type: "earning", amount: 1, shields: 0, reason: "r", ref: null, at: 5, balanceAfter: 1 }],
    };
    storage.items.set(walletKey(guest), JSON.stringify(tampered));
    const wallet = loadWallet(guest);
    assert.equal(wallet.entries.length, 1, "the entry with an invalid key is dropped");
    assert.equal(balanceOf(wallet), 3);
    assert.equal(wallet.entries[0].balanceAfter, 3);
  });
});

describe("hints on this device", () => {
  const scope = "queens:aaaa1111:1700000000000";
  const ask = (ordinal = 1, cooldownScope = scope, chargeScope = scope, store: LocalStore = guest) => requestHint(store, { chargeScope, cooldownScope, ordinal }, clock);

  it("charges five coins and starts a five second cooldown that survives a reload", () => {
    fund(guest, 20);
    const first = ask();
    assert.ok(first.ok && first.charged);
    assert.equal(balance(guest), 15);
    assert.equal(hintCooldownLeft(guest, scope, clock), 5_000);
    // "Reload": the wallet is read back from storage, there is no React state involved.
    clock += 2_000;
    assert.equal(hintCooldownLeft(guest, scope, clock), 3_000);
    const blocked = ask(2);
    assert.equal(!blocked.ok && blocked.reason, "cooldown");
    assert.equal(balance(guest), 15, "a blocked request costs nothing");
    clock += 3_000;
    assert.equal(hintCooldownLeft(guest, scope, clock), 0);
    assert.ok(ask(2).ok);
    assert.equal(balance(guest), 10);
  });

  it("lets only one of several instantaneous requests through (rapid clicks, shortcut and touch together)", () => {
    fund(guest, 50);
    const results = [ask(1), ask(2), ask(3), ask(4), ask(5)];
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(balance(guest), 45);
  });

  it("charges the same hint only once however often it is retried", () => {
    fund(guest, 50);
    assert.ok(ask(1).ok);
    clock += 10_000;
    const retry = ask(1);
    assert.ok(retry.ok && !retry.charged);
    assert.equal(balance(guest), 45);
  });

  it("refuses with too few coins, changing nothing and starting no cooldown", () => {
    fund(guest, 4);
    const r = ask();
    assert.equal(!r.ok && r.reason, "insufficient");
    assert.equal(balance(guest), 4);
    assert.equal(hintCooldownLeft(guest, scope, clock), 0);
  });

  it("does not deliver when the device cannot save the charge", () => {
    fund(guest, 20);
    storage.failWrites = true;
    const r = ask();
    assert.equal(!r.ok && r.reason, "storage");
    storage.failWrites = false;
    assert.equal(balance(guest), 20);
    assert.equal(hintCooldownLeft(guest, scope, clock), 0);
  });

  it("keeps every game's cooldown separate", () => {
    fund(guest, 50);
    assert.ok(ask(1, "queens:aaaa1111:1", "queens:aaaa1111:1").ok);
    assert.ok(ask(1, "zip:bbbb2222:1", "zip:bbbb2222:1").ok);
    assert.ok(ask(1, "sudoku:cccc3333:1", "sudoku:cccc3333:1").ok);
    assert.equal(balance(guest), 35);
  });

  it("starts fresh after a restart, which has a new start time and so a new scope, without touching the old charges", () => {
    fund(guest, 50);
    assert.ok(ask(1, "queens:aaaa1111:100", "queens:aaaa1111:100").ok);
    clock += 6_000;
    assert.ok(ask(1, "queens:aaaa1111:200", "queens:aaaa1111:200").ok, "the restarted attempt pays for its own hint");
    assert.equal(balance(guest), 40);
    const keys = loadWallet(guest).entries.filter((e) => e.type === "hint_charge").map((e) => e.key);
    assert.equal(new Set(keys).size, 2, "both attempts' charges are in the history");
  });

  it("marks an account's hint charge as waiting for the server", () => {
    fund(account, 20);
    const r = ask(1, scope, scope, account);
    assert.ok(r.ok && r.entry?.pending === true);
  });
});

describe("shields on this device", () => {
  const active = (...days: string[]) => new Set(days);

  it("buys one shield for 100 coins and nothing if repeated", () => {
    fund(guest, 250);
    assert.ok(buyShieldLocally(guest, { id: "t1", today: "2026-10-10" }).ok);
    assert.ok(buyShieldLocally(guest, { id: "t1", today: "2026-10-10" }).ok);
    assert.equal(balance(guest), 150);
    assert.equal(loadWallet(guest).shields.length, 1);
  });

  it("leaves everything alone when it cannot pay", () => {
    fund(guest, 40);
    const r = buyShieldLocally(guest, { id: "t2", today: "2026-10-10" });
    assert.equal(!r.ok && r.reason, "insufficient");
    assert.equal(balance(guest), 40);
    assert.equal(loadWallet(guest).shields.length, 0);
  });

  it("protects a missed day exactly once, however often the app is opened", () => {
    fund(guest, 300);
    buyShieldLocally(guest, { id: "a", today: "2026-10-08" });
    buyShieldLocally(guest, { id: "b", today: "2026-10-08" });
    const days = active("2026-10-08", "2026-10-09");
    assert.deepEqual(protectStreakLocally(guest, days, "2026-10-11"), ["2026-10-10"]);
    for (let i = 0; i < 4; i++) assert.deepEqual(protectStreakLocally(guest, days, "2026-10-11"), [], "a reload finds the day already protected");
    const wallet = loadWallet(guest);
    assert.equal(wallet.shields.length, 1);
    assert.deepEqual(wallet.uses.map((u) => u.date), ["2026-10-10"]);
  });

  it("neither creates coins nor marks the day as active", () => {
    fund(guest, 100);
    buyShieldLocally(guest, { id: "a", today: "2026-10-08" });
    const before = balance(guest);
    const days = active("2026-10-08");
    protectStreakLocally(guest, days, "2026-10-10");
    assert.equal(balance(guest), before);
    assert.deepEqual([...days], ["2026-10-08"]);
  });

  it("spends nothing when there is no shield, so the streak breaks as it always did", () => {
    assert.deepEqual(protectStreakLocally(guest, active("2026-10-08"), "2026-10-11"), []);
    assert.equal(loadWallet(guest).uses.length, 0);
  });

  it("does not run for an account: the server decides there", () => {
    assert.deepEqual(protectStreakLocally(account, active("2026-10-08"), "2026-10-11"), []);
  });
});

describe("history that pays", () => {
  const history = createLocalHistory<{ clientId: string; startedAt: number; endedAt: number; reward: number }>({
    suffix: "paid",
    parse: (raw) => (raw && typeof raw === "object" ? (raw as { clientId: string; startedAt: number; endedAt: number; reward: number }) : null),
    grants: (s) => [{ key: `paid:${s.clientId}`, amount: s.reward, reason: "paid", ref: s.clientId, at: s.endedAt }],
  });
  const session = (clientId: string, reward = 10) => ({ clientId, startedAt: 1, endedAt: 2, reward });

  it("credits a saved session once, even if it is saved again", () => {
    assert.ok(history.save(guest, session("game-0001")));
    assert.ok(history.save(guest, session("game-0001")));
    assert.ok(history.save(guest, session("game-0001")));
    assert.equal(balance(guest), 10);
  });

  it("pays on a repeat save if the first could not be recorded, but still only once", () => {
    history.save(guest, session("game-0002"));
    storage.items.delete(walletKey(guest));
    history.save(guest, session("game-0002"));
    assert.equal(balance(guest), 10);
  });
});

describe("practice answers", () => {
  const request = createLocalFetch(guest);
  const post = (url: string, body?: unknown) => request(url, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
  const session = { skill: "multiplication", mode: "fixed", targetQuestionCount: 10, config: { skill: "multiplication", left: [6], right: [7] } };

  async function start(body: Record<string, unknown> = session): Promise<number> {
    const res = await post("/api/sessions", body);
    return (await res.json()).id;
  }
  async function answer(id: number, kind: "right" | "wrong" | "skip" = "right") {
    const next = await (await request(`/api/sessions/${id}/next`)).json();
    const q = next.question.id as string;
    clock += 2_000;
    const body = kind === "skip" ? { questionId: q, outcome: "skipped", responseTimeMs: 900, hinted: false } : { questionId: q, userAnswer: kind === "right" ? questionFromId(q)!.answerText : "1", responseTimeMs: 900, hinted: false };
    return post(`/api/sessions/${id}/attempt`, body);
  }

  it("pays two coins for each correct answer and nothing for wrong or skipped ones", async () => {
    const id = await start();
    await answer(id, "right");
    assert.equal(balance(guest), 2);
    await answer(id, "wrong");
    await answer(id, "skip");
    assert.equal(balance(guest), 2);
    await answer(id, "right");
    assert.equal(balance(guest), 4);
  });

  it("pays the session bonus once, when the session completes, and only when it was a real session", async () => {
    const id = await start();
    for (let i = 0; i < 9; i++) await answer(id, "right");
    assert.equal(balance(guest), 9 * 2, "no bonus while the session is still going");
    await answer(id, "right");
    // Ten correct answers (20) and the five coin bonus.
    assert.equal(balance(guest), 10 * 2 + 5);
    // Ending an already finished session again, or re-reading it, pays nothing more.
    await post(`/api/sessions/${id}/end`);
    await post(`/api/sessions/${id}/end`);
    await request(`/api/sessions/${id}/next`);
    assert.equal(balance(guest), 25);
  });

  it("pays no bonus for a session that is too short or ended early with few answers", async () => {
    const id = await start();
    await answer(id, "right");
    await answer(id, "right");
    await post(`/api/sessions/${id}/end`);
    assert.equal(balance(guest), 4);
  });

  it("pays no bonus below the accuracy bar", async () => {
    const id = await start();
    await answer(id, "right");
    for (let i = 0; i < 5; i++) await answer(id, "wrong");
    await post(`/api/sessions/${id}/end`);
    assert.equal(balance(guest), 2);
  });

  it("does not pay for opening a session or fetching a question", async () => {
    const id = await start();
    await request(`/api/sessions/${id}/next`);
    await request(`/api/sessions/${id}/next`);
    assert.equal(balance(guest), 0);
    assert.equal(storage.items.has(walletKey(guest)), false);
  });

  it("does not pay twice for one answer submitted twice at once", async () => {
    const id = await start();
    const next = await (await request(`/api/sessions/${id}/next`)).json();
    const q = next.question.id as string;
    clock += 2_000;
    const body = { questionId: q, userAnswer: questionFromId(q)!.answerText, responseTimeMs: 900, hinted: false };
    await post(`/api/sessions/${id}/attempt`, body);
    clock += 100;
    await post(`/api/sessions/${id}/attempt`, body);
    assert.equal(balance(guest), 2, "the second submission, 100ms later, is the same answer sent twice");
  });

  it("keeps an account's practice rewards pending and keyed by its client id", async () => {
    const accountRequest = createLocalFetch(account);
    const created = await accountRequest("/api/sessions", { method: "POST", body: JSON.stringify(session), headers: { "Content-Type": "application/json" } });
    const id = (await created.json()).id as number;
    const next = await (await accountRequest(`/api/sessions/${id}/next`)).json();
    clock += 2_000;
    await accountRequest(`/api/sessions/${id}/attempt`, {
      method: "POST",
      body: JSON.stringify({ questionId: next.question.id, userAnswer: questionFromId(next.question.id)!.answerText, responseTimeMs: 900, hinted: false }),
      headers: { "Content-Type": "application/json" },
    });
    const [entry] = loadWallet(account).entries;
    assert.equal(entry.pending, true);
    assert.match(entry.key, /^practice:[A-Za-z0-9-]{8,64}:\d+$/);
  });
});
