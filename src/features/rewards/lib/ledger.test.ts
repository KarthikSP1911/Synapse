import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ECONOMY, type Economy } from "./economy";
import { balanceOf, buyShield, chargeHint, cooldownLeft, credit, creditAll, emptyWallet, hintKey, shieldsOwned, trimEntries, spendShield, type PostOptions } from "./ledger";
import type { Grant, Wallet } from "./types";

const opts = (now: number, pending = false): PostOptions => ({ now, pending });
let seq = 0;
const grant = (amount: number, key = `k${++seq}`, at = 1_000): Grant => ({ key, amount, reason: "test", ref: "r", at });

/** A wallet that has `coins` in it, from a single earning. */
function funded(coins: number): Wallet {
  const r = credit(emptyWallet("guest"), grant(coins, `fund${++seq}`), opts(0));
  assert.ok(r.ok);
  return r.wallet;
}

describe("credit", () => {
  it("adds coins and records an entry with the balance after it", () => {
    const r = credit(emptyWallet("guest"), grant(2, "a", 5_000), opts(0));
    assert.ok(r.ok && !r.duplicate);
    assert.equal(balanceOf(r.wallet), 2);
    assert.equal(r.entry.type, "earning");
    assert.equal(r.entry.balanceAfter, 2);
    assert.equal(r.entry.at, 5_000);
    assert.equal(r.wallet.entries.length, 1);
  });

  it("pays a key only once, however often it is posted", () => {
    let wallet = emptyWallet("guest");
    for (let i = 0; i < 5; i++) {
      const r = credit(wallet, grant(2, "same"), opts(0));
      assert.ok(r.ok);
      wallet = r.wallet;
    }
    assert.equal(balanceOf(wallet), 2);
    assert.equal(wallet.entries.length, 1);
  });

  it("refuses amounts that are not positive whole coins within the sanity bound", () => {
    for (const amount of [0, -3, 1.5, NaN, Infinity, ECONOMY.ledger.maxSingleCredit + 1]) {
      const r = credit(emptyWallet("guest"), grant(amount, `x${amount}`), opts(0));
      assert.equal(r.ok, false, String(amount));
    }
  });

  it("refuses malformed keys", () => {
    for (const key of ["", "has space", "a/b", "x".repeat(ECONOMY.ledger.maxKeyLength + 1)]) {
      assert.equal(credit(emptyWallet("guest"), grant(2, key), opts(0)).ok, false, key);
    }
  });

  it("marks entries pending for a signed-in store", () => {
    const r = credit(emptyWallet("user:1"), grant(2), opts(0, true));
    assert.ok(r.ok);
    assert.equal(r.entry.pending, true);
  });

  it("creditAll skips what is already in the ledger and reports what was new", () => {
    const first = creditAll(emptyWallet("guest"), [grant(2, "a"), grant(2, "b")], opts(0));
    assert.equal(first.added.length, 2);
    const again = creditAll(first.wallet, [grant(2, "b"), grant(5, "c")], opts(0));
    assert.deepEqual(again.added.map((e) => e.key), ["c"]);
    assert.equal(balanceOf(again.wallet), 9);
  });
});

describe("trimEntries", () => {
  const small: Economy = { ...ECONOMY, ledger: { ...ECONOMY.ledger, maxLocalEntries: 3 } };

  it("folds the oldest entries into the opening balance without changing the balance", () => {
    let wallet = emptyWallet("guest");
    for (let i = 1; i <= 6; i++) {
      const r = credit(wallet, grant(i, `t${i}`), opts(0), small);
      assert.ok(r.ok);
      wallet = r.wallet;
    }
    assert.equal(wallet.entries.length, 3);
    assert.equal(balanceOf(wallet), 21);
    assert.equal(wallet.baseCoins, 1 + 2 + 3);
  });

  it("never folds away an entry the server has not confirmed", () => {
    let wallet = emptyWallet("user:1");
    for (let i = 1; i <= 5; i++) {
      const r = credit(wallet, grant(1, `p${i}`), opts(0, i <= 4), small);
      assert.ok(r.ok);
      wallet = r.wallet;
    }
    assert.ok(wallet.entries.some((e) => e.key === "p1"), "the oldest pending entry is kept");
    assert.equal(balanceOf(trimEntries(wallet, small)), 5);
  });
});

describe("buyShield", () => {
  const today = "2026-10-14";

  it("takes the price and adds exactly one shield in one entry", () => {
    const r = buyShield(funded(150), { id: "buy1", today }, opts(10));
    assert.ok(r.ok && !r.duplicate);
    assert.equal(balanceOf(r.wallet), 50);
    assert.equal(shieldsOwned(r.wallet), 1);
    assert.deepEqual(r.wallet.shields, [{ key: "shield:buy:buy1", boughtOn: today }]);
    assert.equal(r.entry.type, "purchase");
    assert.equal(r.entry.amount, -100);
    assert.equal(r.entry.shields, 1);
  });

  it("refuses without enough coins and changes nothing", () => {
    const before = funded(99);
    const r = buyShield(before, { id: "buy1", today }, opts(10));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "insufficient");
    assert.equal(balanceOf(before), 99);
    assert.equal(shieldsOwned(before), 0);
  });

  it("refuses at the maximum inventory", () => {
    let wallet = funded(1_000);
    for (let i = 0; i < ECONOMY.shield.maxInventory; i++) {
      const r = buyShield(wallet, { id: `b${i}`, today }, opts(10));
      assert.ok(r.ok);
      wallet = r.wallet;
    }
    const full = buyShield(wallet, { id: "extra", today }, opts(10));
    assert.equal(!full.ok && full.reason, "inventory_full");
    assert.equal(balanceOf(wallet), 1_000 - 100 * ECONOMY.shield.maxInventory);
  });

  it("is idempotent: a repeated click or retry with the same id buys one shield", () => {
    let wallet = funded(500);
    for (let i = 0; i < 4; i++) {
      const r = buyShield(wallet, { id: "dbl", today }, opts(10));
      assert.ok(r.ok);
      wallet = r.wallet;
    }
    assert.equal(shieldsOwned(wallet), 1);
    assert.equal(balanceOf(wallet), 400);
  });

  it("follows the economy settings", () => {
    const cheap: Economy = { ...ECONOMY, shield: { ...ECONOMY.shield, price: 7, maxInventory: 1 } };
    const bought = buyShield(funded(20), { id: "a", today }, opts(0), cheap);
    assert.ok(bought.ok);
    assert.equal(balanceOf(bought.wallet), 13);
    assert.equal(!buyShield(bought.wallet, { id: "b", today }, opts(0), cheap).ok, true);
  });
});

describe("spendShield", () => {
  function owning(boughtOn: string, id = "s"): Wallet {
    const r = buyShield(funded(300), { id, today: boughtOn }, opts(0));
    assert.ok(r.ok);
    return r.wallet;
  }

  it("spends no coins and removes the shield, recording the protected date", () => {
    const wallet = owning("2026-10-10");
    const r = spendShield(wallet, { date: "2026-10-12" }, opts(50));
    assert.ok(r.ok && !r.duplicate);
    assert.equal(shieldsOwned(r.wallet), 0);
    assert.equal(balanceOf(r.wallet), balanceOf(wallet));
    assert.deepEqual(r.wallet.uses.map((u) => u.date), ["2026-10-12"]);
    assert.equal(r.entry.type, "shield_use");
    assert.equal(r.entry.amount, 0);
  });

  it("protects a given date at most once", () => {
    let wallet = owning("2026-10-01", "a");
    const second = buyShield(wallet, { id: "b", today: "2026-10-01" }, opts(1));
    assert.ok(second.ok);
    wallet = second.wallet;
    const first = spendShield(wallet, { date: "2026-10-05" }, opts(2));
    assert.ok(first.ok);
    const again = spendShield(first.wallet, { date: "2026-10-05" }, opts(3));
    assert.ok(again.ok && again.duplicate);
    assert.equal(shieldsOwned(again.wallet), 1, "the second shield is untouched");
  });

  it("cannot rescue a day from before the shield was bought", () => {
    const wallet = owning("2026-10-10");
    const r = spendShield(wallet, { date: "2026-10-09" }, opts(0));
    assert.equal(!r.ok && r.reason, "no_shield");
    assert.equal(shieldsOwned(wallet), 1);
  });

  it("allows the day it was bought, which was still ahead of the buyer", () => {
    assert.ok(spendShield(owning("2026-10-10"), { date: "2026-10-10" }, opts(0)).ok);
  });

  it("uses the shield bought longest ago first", () => {
    const a = owning("2026-10-01", "old");
    const b = buyShield(a, { id: "new", today: "2026-10-08" }, opts(1));
    assert.ok(b.ok);
    const r = spendShield(b.wallet, { date: "2026-10-09" }, opts(2));
    assert.ok(r.ok);
    assert.deepEqual(r.wallet.shields.map((s) => s.key), ["shield:buy:new"]);
  });

  it("fails with nothing in the inventory", () => {
    const r = spendShield(emptyWallet("guest"), { date: "2026-10-12" }, opts(0));
    assert.equal(!r.ok && r.reason, "no_shield");
  });
});

describe("chargeHint", () => {
  const request = { chargeScope: "queens:abc12345:1000", cooldownScope: "queens:abc12345:1000", ordinal: 1 };

  it("takes exactly the hint price and starts the cooldown", () => {
    const r = chargeHint(funded(20), request, opts(10_000));
    assert.ok(r.ok && r.charged);
    assert.equal(balanceOf(r.wallet), 15);
    assert.equal(r.entry?.type, "hint_charge");
    assert.equal(r.entry?.amount, -5);
    assert.equal(cooldownLeft(r.wallet, request.cooldownScope, 10_000), 5_000);
    assert.equal(cooldownLeft(r.wallet, request.cooldownScope, 12_000), 3_000);
    assert.equal(cooldownLeft(r.wallet, request.cooldownScope, 15_000), 0);
  });

  it("refuses during the cooldown without charging or restarting it", () => {
    const first = chargeHint(funded(20), request, opts(10_000));
    assert.ok(first.ok);
    for (const now of [10_001, 12_000, 14_999]) {
      const blocked = chargeHint(first.wallet, { ...request, ordinal: 2 }, opts(now));
      assert.equal(!blocked.ok && blocked.reason, "cooldown");
      assert.equal(!blocked.ok && blocked.remainingMs, 15_000 - now);
    }
    assert.equal(balanceOf(first.wallet), 15);
    assert.equal(cooldownLeft(first.wallet, request.cooldownScope, 14_000), 1_000, "a blocked click does not restart the cooldown");
    const later = chargeHint(first.wallet, { ...request, ordinal: 2 }, opts(15_000));
    assert.ok(later.ok && later.charged);
    assert.equal(balanceOf(later.wallet), 10);
  });

  it("refuses with too few coins: no charge, no cooldown", () => {
    const wallet = funded(4);
    const r = chargeHint(wallet, request, opts(0));
    assert.equal(!r.ok && r.reason, "insufficient");
    assert.equal(!r.ok && r.message, "Not enough coins. Earn or collect more coins to use a hint.");
    assert.equal(balanceOf(wallet), 4);
    assert.equal(cooldownLeft(wallet, request.cooldownScope, 0), 0);
  });

  it("can spend the last five coins and never goes below zero", () => {
    const r = chargeHint(funded(5), request, opts(0));
    assert.ok(r.ok);
    assert.equal(balanceOf(r.wallet), 0);
    const broke = chargeHint(r.wallet, { ...request, ordinal: 2 }, opts(60_000));
    assert.equal(!broke.ok && broke.reason, "insufficient");
    assert.equal(balanceOf(r.wallet), 0);
  });

  it("never charges the same hint twice (a retry after a crash gets it free)", () => {
    const first = chargeHint(funded(20), request, opts(0));
    assert.ok(first.ok);
    const retry = chargeHint(first.wallet, request, opts(6_000));
    assert.ok(retry.ok && retry.duplicate && !retry.charged);
    assert.equal(balanceOf(retry.wallet), 15);
    assert.equal(retry.wallet.entries.filter((e) => e.key === hintKey(request.chargeScope, 1)).length, 1);
  });

  it("keeps a separate cooldown per game or session", () => {
    const first = chargeHint(funded(50), request, opts(0));
    assert.ok(first.ok);
    const other = chargeHint(first.wallet, { chargeScope: "zip:def45678:2000", cooldownScope: "zip:def45678:2000", ordinal: 1 }, opts(1_000));
    assert.ok(other.ok && other.charged, "a different game is not held up by the first one");
    assert.equal(balanceOf(other.wallet), 40);
  });

  it("shares one cooldown across the questions of a practice session while charging each question once", () => {
    const q1 = { chargeScope: "practice:sess0001:q1", cooldownScope: "practice:sess0001", ordinal: 1 };
    const q2 = { chargeScope: "practice:sess0001:q2", cooldownScope: "practice:sess0001", ordinal: 1 };
    const first = chargeHint(funded(50), q1, opts(0));
    assert.ok(first.ok);
    assert.equal(!chargeHint(first.wallet, q2, opts(1_000)).ok, true);
    assert.ok(chargeHint(first.wallet, q2, opts(5_000)).ok);
  });

  it("a clock set backwards cannot lock a game for longer than the cooldown", () => {
    const first = chargeHint(funded(50), request, opts(1_000_000));
    assert.ok(first.ok);
    assert.equal(cooldownLeft(first.wallet, request.cooldownScope, 0), 5_000);
  });

  it("drops cooldowns that have run out", () => {
    const first = chargeHint(funded(50), request, opts(0));
    assert.ok(first.ok);
    const second = chargeHint(first.wallet, { chargeScope: "zip:x1234567:1", cooldownScope: "zip:x1234567:1", ordinal: 1 }, opts(60_000));
    assert.ok(second.ok);
    assert.deepEqual(Object.keys(second.wallet.cooldowns), ["zip:x1234567:1"]);
  });

  it("rejects malformed scopes and ordinals", () => {
    for (const bad of [{ ...request, ordinal: 0 }, { ...request, ordinal: 1.5 }, { ...request, chargeScope: "has space" }, { ...request, cooldownScope: "" }]) {
      assert.equal(chargeHint(funded(50), bad, opts(0)).ok, false);
    }
  });

  it("follows the economy settings", () => {
    const pricey: Economy = { ...ECONOMY, hint: { cost: 9, cooldownMs: 1_000 } };
    const r = chargeHint(funded(20), request, opts(0), pricey);
    assert.ok(r.ok);
    assert.equal(balanceOf(r.wallet), 11);
    assert.equal(cooldownLeft(r.wallet, request.cooldownScope, 0, pricey), 1_000);
  });
});
