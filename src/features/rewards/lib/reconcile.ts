import { ECONOMY, type Economy } from "@/features/rewards/lib/economy";
import { balanceOf, trimEntries } from "@/features/rewards/lib/ledger";
import type { LedgerEntry, OwnedShield, ShieldUse, Wallet } from "@/features/rewards/lib/types";

/**
 * Merges the account's wallet (the server's answer) into a signed-in device's wallet.
 *
 * The server is the authority for everything it has confirmed: the balance, the shields and which days they protected.
 * What the device adds on top is only what the server has not seen yet: entries still marked `pending`. So the device's
 * balance is always "the server's balance plus the pending entries", and it can neither lose a coin the server holds nor
 * keep one the server refused.
 *
 *  - A pending entry the server has settled (it is in the server's list, was just applied, was refused, or the server
 *    reports holding its key) stops being pending: the server's own record replaces it.
 *  - A pending entry that is still unknown stays: an earning waits for its session to be uploaded, a hint charge made
 *    while the request was in flight waits for the next sync.
 *  - An earning that stays unknown for `PENDING_EARNING_TTL_MS` is dropped. The coins come from the uploaded record on the
 *    server, never from this entry, so dropping it only stops a phantom from sitting in the balance (for example for a
 *    session the server rejected).
 *  - Should the pending entries ever add up to more than the server's balance allows, the newest charges are dropped until
 *    the balance is not negative: the invariant that it never is wins over remembering a hint that was already shown.
 */

export const PENDING_EARNING_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface ServerSnapshot {
  balance: number;
  shields: OwnedShield[];
  uses: ShieldUse[];
  /** The latest confirmed transactions, oldest first. */
  entries: LedgerEntry[];
}

export function reconcile(local: Wallet, snapshot: ServerSnapshot, settled: ReadonlySet<string>, now: number, economy: Economy = ECONOMY): Wallet {
  const confirmed = snapshot.entries.map((e): LedgerEntry => {
    const copy = { ...e };
    delete copy.pending;
    return copy;
  });
  const confirmedKeys = new Set(confirmed.map((e) => e.key));

  const waiting = local.entries
    .filter((e) => e.pending && !confirmedKeys.has(e.key) && !settled.has(e.key))
    .filter((e) => e.type !== "earning" || now - e.at < PENDING_EARNING_TTL_MS)
    .sort((a, b) => a.at - b.at);

  const base = snapshot.balance - confirmed.reduce((sum, e) => sum + e.amount, 0);
  let kept = waiting;
  const build = (pending: LedgerEntry[]): Wallet => {
    let running = base;
    const entries = [...confirmed, ...pending].map((e) => {
      running += e.amount;
      return { ...e, balanceAfter: running };
    });
    return { ...local, baseCoins: base, entries, shields: snapshot.shields, uses: snapshot.uses, syncedAt: now };
  };

  let wallet = build(kept);
  while (balanceOf(wallet) < 0 && kept.some((e) => e.amount < 0)) {
    const newestCharge = [...kept].reverse().find((e) => e.amount < 0) as LedgerEntry;
    kept = kept.filter((e) => e !== newestCharge);
    wallet = build(kept);
  }
  return trimEntries(wallet, economy);
}

/** The protected days the snapshot has that the device did not know of (a shield was used since the last sync). */
export function newlyProtectedDays(local: Wallet, snapshot: ServerSnapshot): string[] {
  const known = new Set(local.uses.map((u) => u.date));
  return snapshot.uses.map((u) => u.date).filter((d) => !known.has(d));
}
