import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ECONOMY } from "@/features/rewards/lib/economy";
import type { Grant } from "@/features/rewards/lib/types";
import { chargeHintIntent, creditGrants, getSnapshot, knownKeys, protectStreak, purchaseShield, type Run } from "./wallet";
import { createTestDb } from "./test-db";

// These tests run the real SQL against a real (in-process) Postgres with the project's wallet migration applied.

let run: Run;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let addUser: (id: number) => Promise<void>;
let nextUser = 100;

before(async () => {
  ({ run, db, addUser } = await createTestDb());
});

async function newUser(): Promise<number> {
  const id = ++nextUser;
  await addUser(id);
  return id;
}

const grant = (amount: number, key: string, at = Date.now()): Grant => ({ key, amount, reason: "test", ref: "ref", at });

/** The invariant behind everything: the running balance is exactly the sum of the ledger, and the shield count is the sum of its deltas. */
async function assertConsistent(userId: number): Promise<{ balance: number; shields: number }> {
  const [totals] = (await db.query<{ balance: number; shields: number }>("SELECT balance, shields_owned AS shields FROM wallets WHERE user_id = $1", [userId])).rows;
  const [ledger] = (await db.query<{ amount: string; shields: string }>("SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(shields_delta),0) AS shields FROM wallet_transactions WHERE user_id = $1", [userId])).rows;
  assert.equal(Number(totals.balance), Number(ledger.amount), "wallet balance equals the sum of the ledger");
  assert.equal(Number(totals.shields), Number(ledger.shields), "shield count equals the sum of the ledger's shield deltas");
  assert.ok(Number(totals.balance) >= 0);
  return { balance: Number(totals.balance), shields: Number(totals.shields) };
}

describe("earnings", () => {
  it("credits each reward once and the ledger adds up to the balance", async () => {
    const user = await newUser();
    assert.equal(await creditGrants(run, user, [grant(2, "a"), grant(5, "b"), grant(10, "c")]), 17);
    assert.deepEqual(await assertConsistent(user), { balance: 17, shields: 0 });
  });

  it("pays nothing for a key it already holds, however the repeat arrives", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(2, "same")]);
    assert.equal(await creditGrants(run, user, [grant(2, "same")]), 0);
    assert.equal(await creditGrants(run, user, [grant(2, "same"), grant(4, "fresh")]), 4);
    // The same reward sent by many requests at once.
    const paid = await Promise.all(Array.from({ length: 8 }, () => creditGrants(run, user, [grant(3, "raced")])));
    assert.equal(paid.reduce((a, b) => a + b, 0), 3);
    assert.deepEqual(await assertConsistent(user), { balance: 2 + 4 + 3, shields: 0 });
  });

  it("refuses rewards that are not whole, positive, bounded coins with a well-formed key", async () => {
    const user = await newUser();
    const bad = [grant(0, "zero"), grant(-5, "neg"), grant(1.5, "frac"), grant(ECONOMY.ledger.maxSingleCredit + 1, "huge"), grant(2, "has space"), grant(2, "")];
    assert.equal(await creditGrants(run, user, bad), 0);
    assert.equal((await getSnapshot(run, user)).entries.length, 0);
  });

  it("gives one user's coins to nobody else", async () => {
    const a = await newUser();
    const b = await newUser();
    await creditGrants(run, a, [grant(9, "shared-key")]);
    await creditGrants(run, b, [grant(4, "shared-key")]);
    assert.equal((await assertConsistent(a)).balance, 9);
    assert.equal((await assertConsistent(b)).balance, 4);
  });
});

describe("buying a Streak Shield", () => {
  it("takes the price and adds one shield in one step", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(150, "fund")]);
    assert.deepEqual(await purchaseShield(run, user, { id: "p1", today: "2026-10-10" }), { ok: true, duplicate: false });
    assert.deepEqual(await assertConsistent(user), { balance: 50, shields: 1 });
    const snap = await getSnapshot(run, user);
    assert.deepEqual(snap.shields, [{ key: "shield:buy:p1", boughtOn: "2026-10-10" }]);
  });

  it("is one purchase however many times, or how concurrently, the same id arrives", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(500, "fund")]);
    const results = await Promise.all(Array.from({ length: 6 }, () => purchaseShield(run, user, { id: "dbl", today: "2026-10-10" })));
    assert.equal(results.filter((r) => r.ok && !r.duplicate).length, 1);
    assert.equal(results.filter((r) => r.ok && r.duplicate).length, 5);
    assert.deepEqual(await assertConsistent(user), { balance: 400, shields: 1 });
  });

  it("refuses without enough coins and changes nothing", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(99, "fund")]);
    const r = await purchaseShield(run, user, { id: "p1", today: "2026-10-10" });
    assert.deepEqual(r, { ok: false, reason: "insufficient", message: "Not enough coins." });
    assert.deepEqual(await assertConsistent(user), { balance: 99, shields: 0 });
    assert.equal((await getSnapshot(run, user)).entries.length, 1, "no purchase row was written");
  });

  it("refuses at the maximum inventory", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(900, "fund")]);
    for (let i = 0; i < ECONOMY.shield.maxInventory; i++) assert.equal((await purchaseShield(run, user, { id: `b${i}`, today: "2026-10-10" })).ok, true);
    const r = await purchaseShield(run, user, { id: "extra", today: "2026-10-10" });
    assert.equal(!r.ok && r.reason, "inventory_full");
    assert.deepEqual(await assertConsistent(user), { balance: 900 - 100 * ECONOMY.shield.maxInventory, shields: ECONOMY.shield.maxInventory });
  });

  it("lets concurrent purchases spend a balance only once: with coins for three, exactly three succeed", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(300, "fund")]);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => purchaseShield(run, user, { id: `race${i}`, today: "2026-10-10" })));
    assert.equal(results.filter((r) => r.ok).length, 3);
    assert.deepEqual(await assertConsistent(user), { balance: 0, shields: 3 });
  });

  it("rejects a malformed request", async () => {
    const user = await newUser();
    assert.equal((await purchaseShield(run, user, { id: "has space", today: "2026-10-10" })).ok, false);
    assert.equal((await purchaseShield(run, user, { id: "ok", today: "yesterday" })).ok, false);
  });
});

describe("hint charges", () => {
  it("charges the server's price, whatever the device thinks", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(20, "fund")]);
    const r = await chargeHintIntent(run, user, { chargeScope: "queens:aaaa1111:100", ordinal: 1, at: Date.now() });
    assert.deepEqual(r, { ok: true, duplicate: false });
    assert.deepEqual(await assertConsistent(user), { balance: 15, shields: 0 });
  });

  it("charges a given hint once, however often it is reported", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(20, "fund")]);
    const intent = { chargeScope: "zip:bbbb2222:100", ordinal: 1, at: Date.now() };
    const results = await Promise.all(Array.from({ length: 5 }, () => chargeHintIntent(run, user, intent)));
    assert.equal(results.filter((r) => r.ok && !r.duplicate).length, 1);
    assert.equal((await assertConsistent(user)).balance, 15);
  });

  it("never lets the balance go below zero: with coins for four hints, exactly four are charged", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(20, "fund")]);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => chargeHintIntent(run, user, { chargeScope: "sudoku:cccc3333:100", ordinal: i + 1, at: Date.now() })));
    assert.equal(results.filter((r) => r.ok).length, 4);
    assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "insufficient"));
    assert.deepEqual(await assertConsistent(user), { balance: 0, shields: 0 });
  });

  it("refuses with an empty wallet and writes nothing", async () => {
    const user = await newUser();
    const r = await chargeHintIntent(run, user, { chargeScope: "queens:dddd4444:1", ordinal: 1, at: Date.now() });
    assert.equal(!r.ok && r.reason, "insufficient");
    assert.equal((await getSnapshot(run, user)).entries.length, 0);
  });

  it("rejects malformed scopes and ordinals", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(50, "fund")]);
    for (const bad of [{ chargeScope: "has space", ordinal: 1 }, { chargeScope: "ok", ordinal: 0 }, { chargeScope: "ok", ordinal: 1.5 }, { chargeScope: "", ordinal: 1 }]) {
      assert.equal((await chargeHintIntent(run, user, { ...bad, at: Date.now() })).ok, false);
    }
    assert.equal((await assertConsistent(user)).balance, 50);
  });
});

describe("streak protection", () => {
  async function withShields(boughtOn: string[]): Promise<number> {
    const user = await newUser();
    await creditGrants(run, user, [grant(100 * boughtOn.length, "fund")]);
    for (const [i, day] of boughtOn.entries()) await purchaseShield(run, user, { id: `s${i}`, today: day });
    return user;
  }
  const active = (...days: string[]) => new Set(days);

  it("uses a shield for a missed day, spends no coins and records the day", async () => {
    const user = await withShields(["2026-10-01"]);
    const before = await assertConsistent(user);
    assert.deepEqual(await protectStreak(run, user, { activeDays: active("2026-10-09"), today: "2026-10-11" }), ["2026-10-10"]);
    const after = await assertConsistent(user);
    assert.equal(after.balance, before.balance, "a shield costs no coins when used");
    assert.equal(after.shields, 0);
    const snap = await getSnapshot(run, user);
    assert.deepEqual(snap.uses.map((u) => u.date), ["2026-10-10"]);
    assert.equal(snap.shields.length, 0);
  });

  it("protects a day only once, however often or concurrently it runs", async () => {
    const user = await withShields(["2026-10-01", "2026-10-01", "2026-10-01"]);
    const input = { activeDays: active("2026-10-09"), today: "2026-10-11" };
    const runs = await Promise.all(Array.from({ length: 6 }, () => protectStreak(run, user, input)));
    assert.equal(runs.flat().length, 1, "one missed day, one shield");
    assert.equal((await assertConsistent(user)).shields, 2);
    assert.deepEqual(await protectStreak(run, user, input), []);
  });

  it("uses one shield per missed day for consecutive missed days", async () => {
    const user = await withShields(["2026-10-01", "2026-10-01", "2026-10-01"]);
    const days = await protectStreak(run, user, { activeDays: active("2026-10-08"), today: "2026-10-12" });
    assert.deepEqual(days, ["2026-10-09", "2026-10-10", "2026-10-11"]);
    assert.equal((await assertConsistent(user)).shields, 0);
    assert.equal((await getSnapshot(run, user)).uses.length, 3);
  });

  it("spends nothing when the gap is longer than the shields", async () => {
    const user = await withShields(["2026-10-01"]);
    assert.deepEqual(await protectStreak(run, user, { activeDays: active("2026-10-08"), today: "2026-10-12" }), []);
    assert.equal((await assertConsistent(user)).shields, 1);
  });

  it("does not let a shield bought after the missed day rescue it", async () => {
    const user = await withShields(["2026-10-11"]);
    assert.deepEqual(await protectStreak(run, user, { activeDays: active("2026-10-09"), today: "2026-10-12" }), []);
    assert.equal((await assertConsistent(user)).shields, 1);
  });

  it("does nothing for a user with no shields, and never creates activity", async () => {
    const user = await newUser();
    assert.deepEqual(await protectStreak(run, user, { activeDays: active("2026-10-09"), today: "2026-10-12" }), []);
    assert.equal((await getSnapshot(run, user)).uses.length, 0);
  });
});

describe("the snapshot", () => {
  it("lists the latest transactions oldest first, each with the balance after it", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(10, "e1", 1_000), grant(5, "e2", 2_000)]);
    await chargeHintIntent(run, user, { chargeScope: "queens:eeee5555:1", ordinal: 1, at: 3_000 });
    const snap = await getSnapshot(run, user);
    assert.equal(snap.balance, 10);
    assert.deepEqual(snap.entries.map((e) => [e.type, e.amount, e.balanceAfter]), [
      ["earning", 10, 10],
      ["earning", 5, 15],
      ["hint_charge", -5, 10],
    ]);
    assert.deepEqual(snap.entries.map((e) => e.at), [1_000, 2_000, 3_000]);
  });

  it("reports which pending keys the server already holds", async () => {
    const user = await newUser();
    await creditGrants(run, user, [grant(2, "have")]);
    assert.deepEqual(await knownKeys(run, user, ["have", "missing"]), ["have"]);
    assert.deepEqual(await knownKeys(run, user, []), []);
  });
});

describe("the database itself refuses what the application must never do", () => {
  it("rejects a negative balance, a shield count out of range and malformed ledger rows", async () => {
    const user = await newUser();
    await run((await import("drizzle-orm")).sql`INSERT INTO wallets (user_id) VALUES (${user}::int) ON CONFLICT DO NOTHING`);
    await assert.rejects(db.query("UPDATE wallets SET balance = -1 WHERE user_id = $1", [user]), /wallets_balance_nonnegative/);
    await assert.rejects(db.query("UPDATE wallets SET shields_owned = -1 WHERE user_id = $1", [user]), /wallets_shields_range/);
    await assert.rejects(db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason) VALUES ($1, 'x1', 'earning', -5, 'bad')", [user]), /sign_check/);
    await assert.rejects(db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason) VALUES ($1, 'x2', 'hint_charge', 5, 'bad')", [user]), /sign_check/);
    await assert.rejects(db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason) VALUES ($1, 'x3', 'mystery', 5, 'bad')", [user]), /(type|sign)_check/);
  });

  it("rejects the same key twice and the same shield used twice", async () => {
    const user = await newUser();
    await db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason) VALUES ($1, 'dup', 'earning', 1, 'a')", [user]);
    await assert.rejects(db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason) VALUES ($1, 'dup', 'earning', 1, 'a')", [user]), /user_key_idx/);
    await db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason, link) VALUES ($1, 'u1', 'shield_use', 0, 'a', 'shield:buy:z')", [user]);
    await assert.rejects(db.query("INSERT INTO wallet_transactions (user_id, key, type, amount, reason, link) VALUES ($1, 'u2', 'shield_use', 0, 'a', 'shield:buy:z')", [user]), /user_link_idx/);
  });
});
