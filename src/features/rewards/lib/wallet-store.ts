import type { LocalStore } from "@/features/offline/lib/guest/api";
import { ECONOMY } from "@/features/rewards/lib/economy";
import { emptyWallet, isValidKey, shieldsOwned } from "@/features/rewards/lib/ledger";
import { TRANSACTION_TYPES, type LedgerEntry, type OwnedShield, type ShieldUse, type Wallet } from "@/features/rewards/lib/types";
import { isDayKey } from "@/features/progress/lib/streak";

/**
 * The wallet kept in this browser: one per viewer, next to their practice history under the same key (a guest's
 * stays here for good; a signed-in user's is a copy of the server's wallet plus whatever is still waiting to be
 * confirmed). Everything read back is checked, because localStorage can hold anything.
 *
 * Every change is a read, a pure step from `ledger.ts`, and a write, all in one synchronous call, so two clicks (or a
 * click and a key press) cannot interleave inside this tab: the second one sees what the first one saved.
 */

export const walletKey = (store: LocalStore): string => `${store.key}:wallet`;
/** Owner recorded in the stored wallet, so one viewer's wallet is never read as another's. */
export const ownerOf = (store: LocalStore): string => store.key;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function parseEntry(raw: unknown): LedgerEntry | null {
  if (!isObj(raw)) return null;
  const { id, key, type, amount, shields, reason, ref, at, balanceAfter, pending } = raw;
  if (typeof id !== "string" || id.length === 0 || id.length > 80 || !isValidKey(key)) return null;
  if (typeof type !== "string" || !(TRANSACTION_TYPES as readonly string[]).includes(type)) return null;
  if (!isInt(amount) || !isInt(shields) || !isInt(at) || at <= 0 || !isInt(balanceAfter)) return null;
  if (typeof reason !== "string" || (ref !== null && typeof ref !== "string")) return null;
  return {
    id,
    key,
    type: type as LedgerEntry["type"],
    amount,
    shields,
    reason: reason.slice(0, 200),
    ref: ref === null ? null : (ref as string).slice(0, ECONOMY.ledger.maxKeyLength),
    at,
    balanceAfter,
    ...(pending === true ? { pending: true as const } : {}),
  };
}

/** A strictly validated wallet from untrusted stored data. Anything unusable reads as an empty wallet for `owner`. */
export function parseWallet(raw: unknown, owner: string): Wallet {
  if (!isObj(raw) || raw.v !== 1 || raw.owner !== owner) return emptyWallet(owner);

  const seen = new Set<string>();
  const entries: LedgerEntry[] = [];
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    const entry = parseEntry(item);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }

  const shieldKeys = new Set<string>();
  const shields: OwnedShield[] = [];
  for (const item of Array.isArray(raw.shields) ? raw.shields : []) {
    if (!isObj(item) || !isValidKey(item.key) || !isDayKey(item.boughtOn) || shieldKeys.has(item.key)) continue;
    shieldKeys.add(item.key);
    shields.push({ key: item.key, boughtOn: item.boughtOn });
  }

  const useDates = new Set<string>();
  const uses: ShieldUse[] = [];
  for (const item of Array.isArray(raw.uses) ? raw.uses : []) {
    if (!isObj(item) || !isDayKey(item.date) || useDates.has(item.date) || typeof item.shieldKey !== "string" || !isInt(item.at)) continue;
    useDates.add(item.date);
    uses.push({ date: item.date, shieldKey: item.shieldKey.slice(0, ECONOMY.ledger.maxKeyLength), at: item.at });
  }

  const cooldowns: Record<string, number> = {};
  if (isObj(raw.cooldowns)) {
    for (const [scope, readyAt] of Object.entries(raw.cooldowns)) if (isValidKey(scope) && isInt(readyAt) && readyAt > 0) cooldowns[scope] = readyAt;
  }

  // The balance is the opening balance plus every entry, so it is rebuilt here rather than trusted: each entry's
  // "balance after" is recomputed, and an opening balance that would leave the total negative is raised to zero it.
  let baseCoins = isInt(raw.baseCoins) && raw.baseCoins >= 0 ? raw.baseCoins : 0;
  let running = baseCoins;
  let lowest = 0;
  for (const e of entries) {
    running += e.amount;
    lowest = Math.min(lowest, running);
  }
  baseCoins -= lowest;
  running = baseCoins;
  for (const e of entries) {
    running += e.amount;
    e.balanceAfter = running;
  }

  return {
    v: 1,
    owner,
    baseCoins,
    entries,
    shields: shields.slice(0, ECONOMY.shield.maxInventory * 4),
    uses: uses.slice(-400),
    cooldowns,
    syncedAt: isInt(raw.syncedAt) ? raw.syncedAt : null,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface Cached {
  raw: string | null;
  wallet: Wallet;
}
const cache = new Map<string, Cached>();

/**
 * The stored wallet. Repeated reads of unchanged storage return the very same object, which is what lets React's
 * `useSyncExternalStore` see "no change" and not re-render.
 */
export function loadWallet(store: LocalStore): Wallet {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(walletKey(store));
  } catch {
    // Storage unavailable: an empty wallet (and a write will fail, which operations report).
  }
  const cached = cache.get(store.key);
  if (cached && cached.raw === raw) return cached.wallet;
  let wallet: Wallet;
  try {
    wallet = parseWallet(raw === null ? null : JSON.parse(raw), ownerOf(store));
  } catch {
    wallet = emptyWallet(ownerOf(store));
  }
  cache.set(store.key, { raw, wallet });
  return wallet;
}

function saveWallet(store: LocalStore, wallet: Wallet): boolean {
  try {
    const raw = JSON.stringify(wallet);
    localStorage.setItem(walletKey(store), raw);
    cache.set(store.key, { raw, wallet: loadFresh(raw, store) });
    return true;
  } catch {
    return false;
  }
}

const loadFresh = (raw: string, store: LocalStore): Wallet => parseWallet(JSON.parse(raw), ownerOf(store));

// ---------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------

export type WalletEvent =
  | { kind: "credited"; entries: LedgerEntry[] }
  | { kind: "hint"; entry: LedgerEntry | null; charged: boolean }
  | { kind: "purchase"; entry: LedgerEntry }
  | { kind: "shield-used"; dates: string[] }
  | { kind: "changed" };

const listeners = new Set<(event: WalletEvent, store: LocalStore) => void>();

export function onWalletEvent(listener: (event: WalletEvent, store: LocalStore) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(store: LocalStore, events: WalletEvent[]): void {
  for (const event of [...events, { kind: "changed" } as const]) for (const listener of listeners) listener(event, store);
}

/**
 * Runs one pure step on the stored wallet and saves the result. If the browser refuses to save, nothing changed, the
 * step's result is discarded and `{ saved: false }` comes back, so a caller can never act on a change that did not stick.
 */
export function updateWallet<T>(store: LocalStore, step: (wallet: Wallet) => { wallet: Wallet; result: T; events?: WalletEvent[] }): { saved: true; result: T } | { saved: false } {
  const before = loadWallet(store);
  const next = step(before);
  if (next.wallet !== before && !saveWallet(store, next.wallet)) return { saved: false };
  if (next.wallet !== before) emit(store, next.events ?? []);
  return { saved: true, result: next.result };
}

/** Replaces the stored wallet outright (used after a sync with the server). */
export function replaceWallet(store: LocalStore, wallet: Wallet): boolean {
  if (!saveWallet(store, wallet)) return false;
  emit(store, []);
  return true;
}

/** Subscribes a component to wallet changes in this tab and, through the `storage` event, in other tabs. */
export function subscribeWallet(store: LocalStore, onChange: () => void): () => void {
  const off = onWalletEvent((event, changed) => {
    if (event.kind === "changed" && changed.key === store.key) onChange();
  });
  const onStorage = (event: StorageEvent) => {
    if (event.key === walletKey(store) || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    off();
    window.removeEventListener("storage", onStorage);
  };
}

export const pendingEntries = (wallet: Wallet): LedgerEntry[] => wallet.entries.filter((e) => e.pending);

export { shieldsOwned };
