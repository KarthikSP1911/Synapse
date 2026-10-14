import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { balanceOf, emptyWallet } from "./ledger";
import { PENDING_EARNING_TTL_MS, newlyProtectedDays, reconcile, type ServerSnapshot } from "./reconcile";
import type { LedgerEntry, Wallet } from "./types";

const entry = (key: string, amount: number, at: number, pending = false, type: LedgerEntry["type"] = amount > 0 ? "earning" : "hint_charge"): LedgerEntry => ({
  id: `id-${key}`,
  key,
  type,
  amount,
  shields: 0,
  reason: "t",
  ref: null,
  at,
  balanceAfter: 0,
  ...(pending ? { pending: true as const } : {}),
});
const local = (...entries: LedgerEntry[]): Wallet => ({ ...emptyWallet("user:1"), entries });
const snapshot = (balance: number, entries: LedgerEntry[] = [], extra: Partial<ServerSnapshot> = {}): ServerSnapshot => ({ balance, shields: [], uses: [], entries, ...extra });
const NOW = 10_000_000;

describe("reconcile", () => {
  it("makes the balance the server's plus whatever is still pending", () => {
    const merged = reconcile(local(entry("p1", 2, NOW - 10, true)), snapshot(50, [entry("old", 50, 1)]), new Set(), NOW);
    assert.equal(balanceOf(merged), 52);
    assert.deepEqual(merged.entries.map((e) => [e.key, !!e.pending]), [["old", false], ["p1", true]]);
  });

  it("replaces a pending entry with the server's record once the server has it", () => {
    const merged = reconcile(local(entry("p1", 2, NOW - 10, true)), snapshot(52, [entry("p1", 2, NOW - 10)]), new Set(), NOW);
    assert.equal(balanceOf(merged), 52, "not counted twice");
    assert.equal(merged.entries.filter((e) => e.key === "p1").length, 1);
    assert.equal(merged.entries[0].pending, undefined);
  });

  it("stops waiting for an entry the server says it already holds, even beyond the entries it listed", () => {
    const merged = reconcile(local(entry("p1", 2, NOW - 10, true)), snapshot(52, [entry("recent", 1, 5)]), new Set(["p1"]), NOW);
    assert.equal(balanceOf(merged), 52 + 0, "the server's balance already includes it");
    assert.equal(merged.entries.some((e) => e.pending), false);
  });

  it("drops a hint charge the server refused, so a refused charge is not remembered as spent", () => {
    const merged = reconcile(local(entry("hint:a:1", -5, NOW - 10, true)), snapshot(3), new Set(["hint:a:1"]), NOW);
    assert.equal(balanceOf(merged), 3);
    assert.equal(merged.entries.length, 0);
  });

  it("keeps a charge made while the request was in flight for the next sync", () => {
    const merged = reconcile(local(entry("hint:a:2", -5, NOW - 10, true)), snapshot(20), new Set(), NOW);
    assert.equal(balanceOf(merged), 15);
    assert.equal(merged.entries[0].pending, true);
  });

  it("drops an earning that has stayed unknown for too long, but never a charge", () => {
    const stale = NOW - PENDING_EARNING_TTL_MS - 1;
    const merged = reconcile(local(entry("e", 2, stale, true), entry("hint:a:1", -5, stale, true)), snapshot(20), new Set(), NOW);
    assert.deepEqual(merged.entries.map((e) => e.key), ["hint:a:1"]);
  });

  it("never leaves a negative balance: pending charges beyond the server's balance are dropped, newest first", () => {
    const merged = reconcile(local(entry("hint:a:1", -5, NOW - 30, true), entry("hint:a:2", -5, NOW - 20, true), entry("hint:a:3", -5, NOW - 10, true)), snapshot(7), new Set(), NOW);
    assert.ok(balanceOf(merged) >= 0);
    assert.deepEqual(merged.entries.map((e) => e.key), ["hint:a:1"]);
    assert.equal(balanceOf(merged), 2);
  });

  it("takes shields and protected days from the server and keeps the device's cooldowns", () => {
    const wallet = { ...local(), cooldowns: { "queens:x": NOW + 3_000 } };
    const merged = reconcile(
      wallet,
      snapshot(0, [], { shields: [{ key: "shield:buy:a", boughtOn: "2026-10-01" }], uses: [{ date: "2026-10-05", shieldKey: "shield:buy:z", at: 1 }] }),
      new Set(),
      NOW
    );
    assert.equal(merged.shields.length, 1);
    assert.deepEqual(merged.uses.map((u) => u.date), ["2026-10-05"]);
    assert.deepEqual(merged.cooldowns, { "queens:x": NOW + 3_000 });
    assert.equal(merged.syncedAt, NOW);
  });

  it("rebuilds each entry's balance-after from the server's balance", () => {
    const merged = reconcile(local(entry("p1", 2, NOW - 10, true)), snapshot(10, [entry("a", 4, 1), entry("b", 6, 2)]), new Set(), NOW);
    assert.equal(merged.baseCoins, 0);
    assert.deepEqual(merged.entries.map((e) => e.balanceAfter), [4, 10, 12]);
  });

  it("tells which protected days are new", () => {
    const wallet: Wallet = { ...local(), uses: [{ date: "2026-10-05", shieldKey: "a", at: 1 }] };
    const snap = snapshot(0, [], { uses: [{ date: "2026-10-05", shieldKey: "a", at: 1 }, { date: "2026-10-06", shieldKey: "b", at: 2 }] });
    assert.deepEqual(newlyProtectedDays(wallet, snap), ["2026-10-06"]);
  });
});
