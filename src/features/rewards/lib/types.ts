/**
 * The vocabulary of the wallet: ledger entries, the wallet itself and what an operation can answer.
 *
 * A wallet is a ledger. Coins and shields are never stored as free-standing numbers that code can overwrite: the
 * balance is the opening balance plus every entry, and every entry carries an idempotency key that can be posted
 * only once.
 */

export const TRANSACTION_TYPES = ["earning", "spending", "purchase", "hint_charge", "refund", "shield_use"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface LedgerEntry {
  /** Unique transaction identifier. */
  id: string;
  /** Idempotency key: posting the same key twice changes nothing the second time. */
  key: string;
  type: TransactionType;
  /** Coins added (positive) or taken (negative). */
  amount: number;
  /** Streak Shields added (a purchase) or used up (+1 / -1); zero for everything else. */
  shields: number;
  reason: string;
  /** The activity, session, game, purchase or date this relates to. */
  ref: string | null;
  /** When it was recorded (epoch ms). */
  at: number;
  /** The balance right after this entry. */
  balanceAfter: number;
  /** Signed-in stores only: the server has not confirmed this entry yet. */
  pending?: true;
}

/** A Streak Shield in the inventory. `key` is the purchase that bought it; `boughtOn` is the local calendar day. */
export interface OwnedShield {
  key: string;
  boughtOn: string;
}

/** A shield that was used up to protect `date`. */
export interface ShieldUse {
  /** The protected calendar day, `YYYY-MM-DD`. */
  date: string;
  /** The purchase key of the shield that was used. */
  shieldKey: string;
  at: number;
}

export interface Wallet {
  v: 1;
  /** Who this wallet belongs to: `guest`, or `user:<id>`. */
  owner: string;
  /** The balance before the first kept entry (older entries are folded into it). */
  baseCoins: number;
  /** Oldest first. */
  entries: LedgerEntry[];
  /** Shields owned right now, oldest purchase first. */
  shields: OwnedShield[];
  /** Days protected by a shield, oldest first. */
  uses: ShieldUse[];
  /** Hint cooldowns: the instant (epoch ms) a game or session may deliver its next hint. */
  cooldowns: Record<string, number>;
  /** Signed-in stores only: when this wallet last matched the server (epoch ms). */
  syncedAt: number | null;
}

/** A reward waiting to be credited. The amount comes from the economy, never from the caller's say-so. */
export interface Grant {
  key: string;
  amount: number;
  reason: string;
  ref: string;
  /** When the rewarded thing happened (epoch ms). */
  at: number;
}

export type FailureReason =
  | "insufficient" // not enough coins
  | "inventory_full" // already holding the maximum number of shields
  | "no_shield" // nothing to use
  | "cooldown" // a hint was delivered a moment ago
  | "invalid" // malformed request
  | "storage" // the device refused to save
  | "offline" // a signed-in purchase needs the server
  | "server"; // the server could not do it

export type OperationResult<T> = ({ ok: true; duplicate: boolean } & T) | { ok: false; reason: FailureReason; message: string; remainingMs?: number };
