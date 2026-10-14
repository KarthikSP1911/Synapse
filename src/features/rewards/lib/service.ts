import type { LocalStore } from "@/features/offline/lib/guest/api";
import { buyShield, chargeHint, cooldownLeft, creditAll, useShield, type PostOptions } from "@/features/rewards/lib/ledger";
import { ECONOMY, type Economy } from "@/features/rewards/lib/economy";
import { planProtection } from "@/features/rewards/lib/protection";
import { loadWallet, updateWallet, type WalletEvent } from "@/features/rewards/lib/wallet-store";
import type { Grant, LedgerEntry, OperationResult } from "@/features/rewards/lib/types";

/**
 * The operations the app performs on this device's wallet. Every game and screen goes through these functions; none
 * of them keeps coin arithmetic of its own, and none accepts a reward amount from a caller (rewards arrive as `Grant`s
 * built from the economy by `grants.ts`).
 *
 * For a signed-in store the entries are written as `pending`, and the server re-checks and confirms them when the
 * device next syncs (see `./sync.ts`); for a guest the device is the only authority.
 */

const postOptions = (store: LocalStore, now: number): PostOptions => ({ now, pending: store.syncable });

/**
 * Credits rewards for something that was just saved. Safe to call any number of times with the same grants: a key already
 * in the ledger is skipped. Never throws and never blocks the activity being rewarded; if the device cannot save, nothing is paid.
 */
export function awardGrants(store: LocalStore | null, grants: readonly Grant[], now: number = Date.now(), economy: Economy = ECONOMY): LedgerEntry[] {
  if (!store || grants.length === 0) return [];
  try {
    const outcome = updateWallet(store, (wallet) => {
      const { wallet: next, added } = creditAll(wallet, grants, postOptions(store, now), economy);
      const events: WalletEvent[] = added.length > 0 ? [{ kind: "credited", entries: added }] : [];
      return { wallet: added.length > 0 ? next : wallet, result: added, events };
    });
    return outcome.saved ? outcome.result : [];
  } catch (error) {
    console.error("Could not record coins:", error);
    return [];
  }
}

export type HintCharge = OperationResult<{ entry: LedgerEntry | null; charged: boolean }>;

/**
 * Charges for one hint and starts its cooldown, or says why not. The caller must already know a hint can be delivered
 * and must deliver it only when this returns `ok`. The cooldown lives in the saved wallet, not in React state, so a
 * double click, the keyboard shortcut and a touch event are all the same check against the same saved value, and a
 * reload does not forget it.
 */
export function requestHint(store: LocalStore | null, request: { chargeScope: string; cooldownScope: string; ordinal: number }, now: number = Date.now(), economy: Economy = ECONOMY): HintCharge {
  if (!store) return { ok: false, reason: "invalid", message: "Hints need an account or guest session." };
  try {
    const outcome = updateWallet<ReturnType<typeof chargeHint>>(store, (wallet) => {
      const result = chargeHint(wallet, request, postOptions(store, now), economy);
      if (!result.ok) return { wallet, result };
      const events: WalletEvent[] = [{ kind: "hint", entry: result.entry, charged: result.charged }];
      return { wallet: result.wallet, result, events };
    });
    if (!outcome.saved) return { ok: false, reason: "storage", message: "This browser is not letting Mathz save, so no hint was used." };
    const result = outcome.result;
    return result.ok ? { ok: true, duplicate: result.duplicate, charged: result.charged, entry: result.entry } : result;
  } catch (error) {
    console.error("Could not charge for the hint:", error);
    return { ok: false, reason: "storage", message: "Something went wrong, so no hint was used." };
  }
}

/** Milliseconds until `cooldownScope` may deliver another hint (0 when it may now). */
export function hintCooldownLeft(store: LocalStore | null, cooldownScope: string, now: number = Date.now(), economy: Economy = ECONOMY): number {
  return store ? cooldownLeft(loadWallet(store), cooldownScope, now, economy) : 0;
}

/** Buys a shield from a guest's own wallet. A signed-in purchase goes to the server instead (`./client.ts`). */
export function buyShieldLocally(store: LocalStore, request: { id: string; today: string }, now: number = Date.now(), economy: Economy = ECONOMY): OperationResult<{ entry: LedgerEntry }> {
  const outcome = updateWallet<ReturnType<typeof buyShield>>(store, (wallet) => {
    const result = buyShield(wallet, request, postOptions(store, now), economy);
    if (!result.ok || result.duplicate) return { wallet, result };
    return { wallet: result.wallet, result, events: [{ kind: "purchase", entry: result.entry } as WalletEvent] };
  });
  if (!outcome.saved) return { ok: false, reason: "storage", message: "This browser is not letting Mathz save, so nothing was bought." };
  const result = outcome.result;
  return result.ok ? { ok: true, duplicate: result.duplicate, entry: result.entry } : result;
}

/**
 * Looks at this device's own record of active days and, for any missed day a shield can protect, uses the shield. For a
 * guest only: a signed-in user's days are known better by the server, which makes this decision for them.
 * Returns the days newly protected.
 */
export function protectStreakLocally(store: LocalStore, activeDays: ReadonlySet<string>, today: string, now: number = Date.now(), economy: Economy = ECONOMY): string[] {
  if (store.syncable) return [];
  const outcome = updateWallet(store, (wallet) => {
    if (wallet.shields.length === 0) return { wallet, result: [] as string[] };
    const plan = planProtection({
      activeDays,
      protectedDays: new Set(wallet.uses.map((u) => u.date)),
      shields: wallet.shields,
      today,
      lookbackDays: economy.shield.lookbackDays,
    });
    let next = wallet;
    const protectedNow: string[] = [];
    for (const { date, shieldKey } of plan.assignments) {
      // Use exactly the shield the plan chose, so the day-by-day matching holds.
      const result = useShield(next, { date, shieldKey }, postOptions(store, now), economy);
      if (!result.ok || result.duplicate) continue;
      next = result.wallet;
      protectedNow.push(date);
    }
    return protectedNow.length === 0 ? { wallet, result: protectedNow } : { wallet: next, result: protectedNow, events: [{ kind: "shield-used", dates: protectedNow } as WalletEvent] };
  });
  return outcome.saved ? outcome.result : [];
}
