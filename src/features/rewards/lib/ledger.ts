import { ECONOMY, type Economy } from "@/features/rewards/lib/economy";
import type { FailureReason, Grant, LedgerEntry, OperationResult, TransactionType, Wallet } from "@/features/rewards/lib/types";

/**
 * The wallet rules as pure functions: each takes a wallet and returns a new one (or says why it cannot), and the clock
 * is passed in. The browser runs them on the wallet kept in localStorage; the server checks the same rules before its
 * own atomic SQL. Nothing here touches storage, the network or the DOM.
 *
 * Invariants every function keeps:
 *  - the balance is never negative;
 *  - an idempotency key is posted at most once, so a retry, a re-render or a repeated sync changes nothing;
 *  - an amount comes from the economy or from a price, never from a caller's say-so;
 *  - coins and shields change together in one entry, so a purchase can neither take coins without a shield nor the reverse.
 */

export const KEY_PATTERN = /^[A-Za-z0-9:_.-]+$/;

export const emptyWallet = (owner: string): Wallet => ({ v: 1, owner, baseCoins: 0, entries: [], shields: [], uses: [], cooldowns: {}, syncedAt: null });

export const balanceOf = (wallet: Wallet): number => wallet.entries.reduce((sum, e) => sum + e.amount, wallet.baseCoins);

export const shieldsOwned = (wallet: Wallet): number => wallet.shields.length;

export const findEntry = (wallet: Wallet, key: string): LedgerEntry | undefined => wallet.entries.find((e) => e.key === key);

export function isValidKey(key: unknown, economy: Economy = ECONOMY): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= economy.ledger.maxKeyLength && KEY_PATTERN.test(key);
}

export interface PostOptions {
  now: number;
  /** Signed-in stores: the entry waits for the server to confirm it. */
  pending: boolean;
  newId?: () => string;
}

const randomId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const fail = <T>(reason: FailureReason, message: string, extra: { remainingMs?: number } = {}): OperationResult<T> => ({ ok: false, reason, message, ...extra });

interface Draft {
  key: string;
  type: TransactionType;
  amount: number;
  shields: number;
  reason: string;
  ref: string | null;
}

/** Folds the oldest confirmed entries into the opening balance once there are too many to keep. */
export function trimEntries(wallet: Wallet, economy: Economy = ECONOMY): Wallet {
  const excess = wallet.entries.length - economy.ledger.maxLocalEntries;
  if (excess <= 0) return wallet;
  let drop = excess;
  let folded = 0;
  const kept = wallet.entries.filter((e) => {
    if (drop > 0 && !e.pending) {
      drop -= 1;
      folded += e.amount;
      return false;
    }
    return true;
  });
  return { ...wallet, baseCoins: wallet.baseCoins + folded, entries: kept };
}

/** Appends one entry. The single place where the balance changes, so the invariants live here. */
function post(wallet: Wallet, draft: Draft, options: PostOptions, economy: Economy): OperationResult<{ wallet: Wallet; entry: LedgerEntry }> {
  if (!isValidKey(draft.key, economy) || !Number.isSafeInteger(draft.amount)) return fail("invalid", "That request is not valid.");

  const existing = findEntry(wallet, draft.key);
  if (existing) return { ok: true, duplicate: true, wallet, entry: existing };

  const balance = balanceOf(wallet);
  if (balance + draft.amount < 0) return fail("insufficient", "Not enough coins.");

  const entry: LedgerEntry = {
    id: (options.newId ?? randomId)(),
    key: draft.key,
    type: draft.type,
    amount: draft.amount,
    shields: draft.shields,
    reason: draft.reason.slice(0, 200),
    ref: draft.ref === null ? null : draft.ref.slice(0, economy.ledger.maxKeyLength),
    at: options.now,
    balanceAfter: balance + draft.amount,
    ...(options.pending ? { pending: true as const } : {}),
  };
  return { ok: true, duplicate: false, wallet: trimEntries({ ...wallet, entries: [...wallet.entries, entry] }, economy), entry };
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

/** Credits one reward. A key that is already in the ledger is a no-op, which is what stops a repeat from paying twice. */
export function credit(wallet: Wallet, grant: Grant, options: PostOptions, economy: Economy = ECONOMY): OperationResult<{ wallet: Wallet; entry: LedgerEntry }> {
  if (!Number.isSafeInteger(grant.amount) || grant.amount <= 0 || grant.amount > economy.ledger.maxSingleCredit) return fail("invalid", "That reward is not valid.");
  return post(wallet, { key: grant.key, type: "earning", amount: grant.amount, shields: 0, reason: grant.reason, ref: grant.ref }, { ...options, now: grant.at || options.now }, economy);
}

/** Credits several rewards in one go; returns the entries that were actually new. */
export function creditAll(wallet: Wallet, grants: readonly Grant[], options: PostOptions, economy: Economy = ECONOMY): { wallet: Wallet; added: LedgerEntry[] } {
  let current = wallet;
  const added: LedgerEntry[] = [];
  for (const grant of grants) {
    const result = credit(current, grant, options, economy);
    if (result.ok && !result.duplicate) {
      current = result.wallet;
      added.push(result.entry);
    }
  }
  return { wallet: current, added };
}

// ---------------------------------------------------------------------------
// Streak Shields
// ---------------------------------------------------------------------------

export const purchaseKey = (id: string): string => `shield:buy:${id}`;
export const useKey = (date: string): string => `shield:use:${date}`;

/**
 * Buys one Streak Shield: takes the price and adds the shield in the same entry. Refused when the user cannot pay or
 * already holds the maximum. `id` is a token the caller makes once per purchase attempt and reuses on a retry, so a
 * double click or a repeated request is the same purchase.
 */
export function buyShield(wallet: Wallet, request: { id: string; today: string }, options: PostOptions, economy: Economy = ECONOMY): OperationResult<{ wallet: Wallet; entry: LedgerEntry }> {
  const key = purchaseKey(request.id);
  const existing = findEntry(wallet, key);
  if (existing) return { ok: true, duplicate: true, wallet, entry: existing };
  if (wallet.shields.length >= economy.shield.maxInventory) return fail("inventory_full", `You already have the maximum of ${economy.shield.maxInventory} Streak Shields.`);
  if (balanceOf(wallet) < economy.shield.price) return fail("insufficient", `A Streak Shield costs ${economy.shield.price} coins.`);

  const posted = post(wallet, { key, type: "purchase", amount: -economy.shield.price, shields: 1, reason: "Bought a Streak Shield", ref: request.today }, options, economy);
  if (!posted.ok || posted.duplicate) return posted;
  return { ...posted, wallet: { ...posted.wallet, shields: [...posted.wallet.shields, { key, boughtOn: request.today }] } };
}

/**
 * Uses up one shield to protect `date`. At most once per date (the key is the date) and never more than one shield per
 * date. Picks the shield bought longest ago that was already owned on `date` (or the one named by `shieldKey`, when the
 * planner has matched days to shields): a shield bought after a day is over cannot rescue that day.
 */
export function useShield(wallet: Wallet, request: { date: string; shieldKey?: string }, options: PostOptions, economy: Economy = ECONOMY): OperationResult<{ wallet: Wallet; entry: LedgerEntry }> {
  const key = useKey(request.date);
  const existing = findEntry(wallet, key);
  if (existing || wallet.uses.some((u) => u.date === request.date)) {
    return existing ? { ok: true, duplicate: true, wallet, entry: existing } : fail("invalid", "That day is already protected.");
  }
  const shield = request.shieldKey ? wallet.shields.find((s) => s.key === request.shieldKey && s.boughtOn <= request.date) : eligibleShield(wallet, request.date);
  if (!shield) return fail("no_shield", "No Streak Shield was available for that day.");

  const posted = post(wallet, { key, type: "shield_use", amount: 0, shields: -1, reason: `Streak Shield protected ${request.date}`, ref: request.date }, options, economy);
  if (!posted.ok || posted.duplicate) return posted;
  return {
    ...posted,
    wallet: {
      ...posted.wallet,
      shields: posted.wallet.shields.filter((s) => s.key !== shield.key),
      uses: [...posted.wallet.uses, { date: request.date, shieldKey: shield.key, at: options.now }],
    },
  };
}

/** The oldest owned shield that was bought on or before `date`, or undefined. */
export const eligibleShield = (wallet: Wallet, date: string) =>
  [...wallet.shields].sort((a, b) => (a.boughtOn < b.boughtOn ? -1 : a.boughtOn > b.boughtOn ? 1 : 0)).find((s) => s.boughtOn <= date);

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

export interface HintRequest {
  /** What a hint is charged against: one attempt at a puzzle, or one question of a practice session. */
  chargeScope: string;
  /** What shares one cooldown: the puzzle or the whole practice session. */
  cooldownScope: string;
  /** Which hint this is within the charge scope (1, 2, ...). The same ordinal is never charged twice. */
  ordinal: number;
}

export const hintKey = (chargeScope: string, ordinal: number): string => `hint:${chargeScope}:${ordinal}`;

/** Milliseconds left on a cooldown, never more than the cooldown itself (a device clock set backwards cannot lock a game). */
export function cooldownLeft(wallet: Wallet, scope: string, now: number, economy: Economy = ECONOMY): number {
  const readyAt = wallet.cooldowns[scope];
  if (readyAt === undefined) return 0;
  return Math.min(economy.hint.cooldownMs, Math.max(0, readyAt - now));
}

/** Drops cooldowns that have run out, so the stored wallet does not collect one per game ever played. */
export function pruneCooldowns(wallet: Wallet, now: number): Wallet {
  const live = Object.entries(wallet.cooldowns).filter(([, readyAt]) => readyAt > now);
  return live.length === Object.keys(wallet.cooldowns).length ? wallet : { ...wallet, cooldowns: Object.fromEntries(live) };
}

/**
 * The charge half of a hint. The caller has already worked out that a hint can be delivered (a hint that cannot be
 * delivered must never reach this function), and delivers it only if this says ok. In order:
 *
 *   1. cooldown still running    -> refused, nothing charged, cooldown untouched
 *   2. this hint already charged -> ok, nothing charged (a retry after a crash recovers the hint for free)
 *   3. not enough coins          -> refused, nothing charged, no cooldown
 *   4. otherwise                 -> the price is taken and the cooldown starts, in one new wallet
 *
 * Because the check and the charge are one pure step on one wallet value, a caller that saves the result before it
 * shows the hint can never show a hint it has not been charged for.
 */
export function chargeHint(wallet: Wallet, request: HintRequest, options: PostOptions, economy: Economy = ECONOMY): OperationResult<{ wallet: Wallet; entry: LedgerEntry | null; charged: boolean }> {
  if (!isValidKey(request.chargeScope, economy) || !isValidKey(request.cooldownScope, economy) || !Number.isSafeInteger(request.ordinal) || request.ordinal < 1) {
    return fail("invalid", "That hint request is not valid.");
  }
  const left = cooldownLeft(wallet, request.cooldownScope, options.now, economy);
  if (left > 0) return fail("cooldown", `Hint available in ${Math.ceil(left / 1000)}s.`, { remainingMs: left });

  const withCooldown = (w: Wallet): Wallet => pruneCooldowns({ ...w, cooldowns: { ...w.cooldowns, [request.cooldownScope]: options.now + economy.hint.cooldownMs } }, options.now);

  const key = hintKey(request.chargeScope, request.ordinal);
  const existing = findEntry(wallet, key);
  if (existing) return { ok: true, duplicate: true, charged: false, entry: existing, wallet: withCooldown(wallet) };

  if (balanceOf(wallet) < economy.hint.cost) {
    return fail("insufficient", "Not enough coins. Earn or collect more coins to use a hint.");
  }
  const posted = post(wallet, { key, type: "hint_charge", amount: -economy.hint.cost, shields: 0, reason: "Hint", ref: request.chargeScope }, options, economy);
  if (!posted.ok) return posted;
  return { ok: true, duplicate: false, charged: true, entry: posted.entry, wallet: withCooldown(posted.wallet) };
}
