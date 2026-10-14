import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { userStorageKey } from "@/features/offline/lib/guest/storage";
import type { LocalStore } from "@/features/offline/lib/guest/api";
import { practiceAnswerGrants } from "@/features/rewards/lib/grants";
import { balanceOf, hintKey } from "@/features/rewards/lib/ledger";
import { awardGrants, requestHint } from "@/features/rewards/lib/service";
import { purchaseShieldOnline, syncWallet } from "@/features/rewards/lib/sync";
import { loadWallet } from "@/features/rewards/lib/wallet-store";
import { parsePurchaseRequest, parseSyncRequest } from "./requests";
import { chargeHintIntent, creditGrants, getSnapshot, knownKeys, protectStreak, purchaseShield, type Run } from "./wallet";
import { createTestDb } from "./test-db";

/**
 * The device and the server together, without HTTP: a signed-in device's wallet in a fake localStorage, the server's wallet in
 * an in-process Postgres, and a `fetch` that answers the two wallet routes with the same functions the routes call.
 */

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

let run: Run;
let addUser: (id: number) => Promise<void>;
let nextUser = 500;
let userId: number;
let store: LocalStore;
let activeDays: Set<string>;
let today: string;
let online: boolean;
// The real clock is left alone (the in-process database needs it); every time the code under test takes is passed in.
const NOW = Date.now();

before(async () => {
  ({ run, addUser } = await createTestDb());
});

beforeEach(async () => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  userId = ++nextUser;
  await addUser(userId);
  store = { key: userStorageKey(userId), syncable: true };
  activeDays = new Set();
  today = "2026-10-14";
  online = true;
});
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** What `POST /api/wallet/sync` and `POST /api/wallet/purchase` do, minus the cookie check. */
const fakeFetch = (async (url: string, init?: RequestInit) => {
  if (!online) throw new TypeError("network down");
  const body = JSON.parse(String(init?.body ?? "{}"));
  if (url === "/api/wallet/sync") {
    const parsed = parseSyncRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const applied: string[] = [];
    const rejected: { key: string; reason: string }[] = [];
    for (const intent of parsed.request.hints) {
      const result = await chargeHintIntent(run, userId, intent);
      const key = hintKey(intent.chargeScope, intent.ordinal);
      if (result.ok) applied.push(key);
      else rejected.push({ key, reason: result.reason });
    }
    const protectedDays = await protectStreak(run, userId, { activeDays, today });
    const known = await knownKeys(run, userId, parsed.request.pendingKeys);
    return json({ snapshot: await getSnapshot(run, userId), applied, rejected, known, protectedDays });
  }
  if (url === "/api/wallet/purchase") {
    const parsed = parsePurchaseRequest(body);
    if (!parsed.ok) return json({ ok: false, reason: "invalid", message: parsed.error }, 400);
    const result = await purchaseShield(run, userId, { id: parsed.id, today });
    return json({ ...result, snapshot: await getSnapshot(run, userId) }, result.ok ? 200 : 409);
  }
  return json({}, 404);
}) as typeof fetch;

const deps = () => ({ fetch: fakeFetch, now: () => NOW });
const balance = () => balanceOf(loadWallet(store));
const serverBalance = async () => (await getSnapshot(run, userId)).balance;

/** The practice session a device earned coins for, as both sides compute its rewards. */
const session = { id: "sess-0001-aaaa", attempts: [{ outcome: "correct", at: NOW - 5000, questionId: "q1" }, { outcome: "correct", at: NOW - 3000, questionId: "q2" }, { outcome: "incorrect", at: NOW - 1000, questionId: "q3" }] };

describe("earning on the device and on the server", () => {
  it("counts a session's coins once: the device's pending entries become the server's after the upload", async () => {
    awardGrants(store, practiceAnswerGrants(session.id, session.attempts), NOW);
    assert.equal(balance(), 4, "shown at once, before any upload");
    assert.equal(loadWallet(store).entries.every((e) => e.pending), true);

    // The upload route credits the same session with the same keys.
    await creditGrants(run, userId, practiceAnswerGrants(session.id, session.attempts), undefined, NOW);
    assert.equal(await serverBalance(), 4);

    const outcome = await syncWallet(userId, deps());
    assert.equal(outcome.ok, true);
    assert.equal(balance(), 4, "not counted twice");
    assert.equal(loadWallet(store).entries.some((e) => e.pending), false);
  });

  it("keeps coins the server has not heard about yet, and adds them to the server's balance", async () => {
    await creditGrants(run, userId, [{ key: "elsewhere", amount: 50, reason: "another device", ref: "x", at: NOW }]);
    awardGrants(store, practiceAnswerGrants(session.id, session.attempts), NOW);
    await syncWallet(userId, deps());
    assert.equal(balance(), 54, "the account's 50 plus the 4 still waiting for their upload");
    assert.equal(await serverBalance(), 50);
  });

  it("never pays a doctored amount: the server credits from its own rules, whatever the device holds", async () => {
    // A device cannot send an amount at all; the only way coins arrive is a grant the server computed.
    assert.equal(parseSyncRequest({ hints: [], pendingKeys: [], balance: 999_999 }).ok, true);
    await syncWallet(userId, deps());
    assert.equal(await serverBalance(), 0);
  });
});

describe("hints", () => {
  const request = (ordinal: number, now: number) => requestHint(store, { chargeScope: "queens:game0001:100", cooldownScope: "queens:game0001:100", ordinal }, now);

  it("a hint delivered on the device is charged by the server at its own price, exactly once", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 20, reason: "t", ref: "x", at: NOW }]);
    await syncWallet(userId, deps());
    assert.equal(balance(), 20);

    assert.ok(request(1, NOW).ok);
    assert.equal(balance(), 15, "charged on the device immediately");
    await syncWallet(userId, deps());
    await syncWallet(userId, deps());
    assert.equal(await serverBalance(), 15, "charged once on the account, however often it syncs");
    assert.equal(balance(), 15);
    assert.equal(loadWallet(store).entries.some((e) => e.pending), false);
  });

  it("offline hints wait, then settle when the connection returns", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 20, reason: "t", ref: "x", at: NOW }]);
    await syncWallet(userId, deps());
    online = false;
    assert.ok(request(1, NOW).ok);
    assert.ok(request(2, NOW + 6000).ok);
    assert.equal((await syncWallet(userId, deps())).ok, false);
    assert.equal(balance(), 10, "still shown as spent");
    online = true;
    assert.equal((await syncWallet(userId, deps())).ok, true);
    assert.equal(await serverBalance(), 10);
    assert.equal(balance(), 10);
  });

  it("a charge the server refuses (the account was already spent elsewhere) is dropped, never leaving a negative balance", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 10, reason: "t", ref: "x", at: NOW }]);
    await syncWallet(userId, deps());
    online = false;
    assert.ok(request(1, NOW).ok);
    assert.ok(request(2, NOW + 6000).ok);
    // Meanwhile another device spends the account's coins.
    await chargeHintIntent(run, userId, { chargeScope: "zip:other0001:1", ordinal: 1, at: NOW });
    await chargeHintIntent(run, userId, { chargeScope: "zip:other0001:1", ordinal: 2, at: NOW });
    online = true;
    await syncWallet(userId, deps());
    assert.equal(await serverBalance(), 0);
    assert.ok(balance() >= 0);
    assert.equal(balance(), 0);
  });
});

describe("Streak Shields", () => {
  it("buys on the server: price, inventory and balance are the server's, and the device shows its answer", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 250, reason: "t", ref: "x", at: NOW }]);
    await syncWallet(userId, deps());
    assert.deepEqual(await purchaseShieldOnline(userId, "purchase-aaaa-0001", deps()), { ok: true, duplicate: false });
    assert.equal(balance(), 150);
    assert.equal(loadWallet(store).shields.length, 1);
    // The same click repeated, or a retried request, is the same purchase.
    assert.deepEqual(await purchaseShieldOnline(userId, "purchase-aaaa-0001", deps()), { ok: true, duplicate: true });
    assert.equal(balance(), 150);
    assert.equal(loadWallet(store).shields.length, 1);
  });

  it("refuses without enough coins and leaves the wallet as the server has it", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 60, reason: "t", ref: "x", at: NOW }]);
    const result = await purchaseShieldOnline(userId, "purchase-bbbb-0002", deps());
    assert.equal(!result.ok && result.reason, "insufficient");
    assert.equal(balance(), 60);
    assert.equal(loadWallet(store).shields.length, 0);
  });

  it("cannot buy while offline, and says so without changing anything", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 500, reason: "t", ref: "x", at: NOW }]);
    await syncWallet(userId, deps());
    online = false;
    const result = await purchaseShieldOnline(userId, "purchase-cccc-0003", deps());
    assert.equal(!result.ok && result.reason, "offline");
    assert.equal(balance(), 500);
    assert.equal(loadWallet(store).shields.length, 0);
  });

  it("protects a missed day during the sync, once, and does not make the day active or pay coins", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 100, reason: "t", ref: "x", at: NOW }]);
    today = "2026-10-12";
    await syncWallet(userId, deps());
    assert.deepEqual(await purchaseShieldOnline(userId, "purchase-dddd-0004", deps()), { ok: true, duplicate: false });
    activeDays = new Set(["2026-10-12"]);

    today = "2026-10-14";
    await syncWallet(userId, deps());
    await syncWallet(userId, deps());
    await syncWallet(userId, deps());
    const wallet = loadWallet(store);
    assert.deepEqual(wallet.uses.map((u) => u.date), ["2026-10-13"]);
    assert.equal(wallet.shields.length, 0);
    assert.equal(balance(), 0, "buying cost the 100; using the shield cost and paid nothing");
    assert.equal(activeDays.has("2026-10-13"), false, "the protected day is not recorded as activity");
  });

  it("a shield bought after the day was missed does not rescue it", async () => {
    await creditGrants(run, userId, [{ key: "fund", amount: 100, reason: "t", ref: "x", at: NOW }]);
    activeDays = new Set(["2026-10-10"]);
    today = "2026-10-12";
    await syncWallet(userId, deps());
    await purchaseShieldOnline(userId, "purchase-eeee-0005", deps());
    today = "2026-10-13";
    await syncWallet(userId, deps());
    assert.equal(loadWallet(store).uses.length, 0, "bought on the 12th, the missed day is the 11th");
    assert.equal(loadWallet(store).shields.length, 1);
  });
});
