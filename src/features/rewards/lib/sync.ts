import { userStorageKey } from "@/features/offline/lib/guest/storage";
import type { LocalStore } from "@/features/offline/lib/guest/api";
import { MAX_HINT_INTENTS, MAX_PENDING_KEYS } from "@/features/rewards/lib/limits";
import { newlyProtectedDays, reconcile, type ServerSnapshot } from "@/features/rewards/lib/reconcile";
import { loadWallet, pendingEntries, updateWallet, type WalletEvent } from "@/features/rewards/lib/wallet-store";
import type { FailureReason, OperationResult } from "@/features/rewards/lib/types";

/**
 * Browser side of the wallet's sync with the account. A signed-in device keeps a copy of the wallet; this settles it with the
 * server: it reports the hints delivered since the last sync (so the server can charge them at its own price), asks the
 * server to protect any missed day a shield can cover, and replaces the device's copy with the account's, keeping only what
 * the server has not seen yet. Everything is safe to repeat or interrupt: the server recognises what it already holds by key.
 */

const REQUEST_TIMEOUT_MS = 20_000;
/** Without anything pending, the wallet is not refreshed more often than this unless asked to. */
export const WALLET_REFRESH_MS = 5 * 60 * 1000;

export type WalletSyncOutcome = { ok: true; protectedDays: string[] } | { ok: false; reason: "signed-out" | "network" | "server" };

export interface WalletSyncDeps {
  fetch: typeof fetch;
  now: () => number;
}

const defaultDeps = (): WalletSyncDeps => ({ fetch: (...args) => fetch(...args), now: () => Date.now() });

const storeFor = (userId: number): LocalStore => ({ key: userStorageKey(userId), syncable: true });

async function request(deps: WalletSyncDeps, url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await deps.fetch(url, { ...init, signal: controller.signal, cache: "no-store", credentials: "same-origin" });
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a sync is worth making now: something is waiting, or the copy is stale. */
export function walletSyncDue(userId: number, now: number = Date.now()): boolean {
  const wallet = loadWallet(storeFor(userId));
  return pendingEntries(wallet).length > 0 || wallet.syncedAt === null || now - wallet.syncedAt > WALLET_REFRESH_MS;
}

export const pendingWalletCount = (userId: number): number => pendingEntries(loadWallet(storeFor(userId))).length;

const ordinalOf = (key: string): number => Number(key.slice(key.lastIndexOf(":") + 1));

/** Applies the server's wallet to the device's, announcing any day a shield protected in the meantime. */
function applySnapshot(store: LocalStore, snapshot: ServerSnapshot, settled: Set<string>, now: number): string[] {
  let announced: string[] = [];
  updateWallet(store, (wallet) => {
    announced = newlyProtectedDays(wallet, snapshot);
    const events: WalletEvent[] = announced.length > 0 && wallet.syncedAt !== null ? [{ kind: "shield-used", dates: announced }] : [];
    return { wallet: reconcile(wallet, snapshot, settled, now), result: undefined, events };
  });
  return announced;
}

export async function syncWallet(userId: number, deps: WalletSyncDeps = defaultDeps()): Promise<WalletSyncOutcome> {
  const store = storeFor(userId);
  try {
    const pending = pendingEntries(loadWallet(store));
    const hints = pending
      .filter((e) => e.type === "hint_charge" && e.ref !== null)
      .slice(0, MAX_HINT_INTENTS)
      .map((e) => ({ chargeScope: e.ref as string, ordinal: ordinalOf(e.key), at: e.at }));
    const pendingKeys = pending.slice(0, MAX_PENDING_KEYS).map((e) => e.key);

    const res = await request(deps, "/api/wallet/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hints, pendingKeys }) });
    if (res.status === 401) return { ok: false, reason: "signed-out" };
    if (!res.ok) return { ok: false, reason: "server" };
    const body: { snapshot?: ServerSnapshot; applied?: string[]; rejected?: { key: string }[]; known?: string[]; protectedDays?: string[] } = await res.json().catch(() => ({}));
    if (!body.snapshot || typeof body.snapshot.balance !== "number") return { ok: false, reason: "server" };

    const settled = new Set<string>([...(body.applied ?? []), ...(body.rejected ?? []).map((r) => r.key), ...(body.known ?? [])]);
    applySnapshot(store, body.snapshot, settled, deps.now());
    return { ok: true, protectedDays: body.protectedDays ?? [] };
  } catch {
    // Offline, timed out or aborted: whatever was not confirmed stays pending and is sent next time.
    return { ok: false, reason: "network" };
  }
}

type PurchaseReply = { ok?: boolean; reason?: FailureReason; message?: string; duplicate?: boolean; snapshot?: ServerSnapshot };

/**
 * Buys a shield from the account. The server prices it, checks the balance and the inventory, and records it in one step; the
 * device only ever shows what the server answers. `id` is reused if the request has to be repeated, so a retry cannot buy twice.
 */
export async function purchaseShieldOnline(userId: number, id: string, deps: WalletSyncDeps = defaultDeps()): Promise<OperationResult<unknown>> {
  const store = storeFor(userId);
  let res: Response;
  try {
    res = await request(deps, "/api/wallet/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  } catch {
    return { ok: false, reason: "offline", message: "Could not reach Mathz, so nothing was bought. Check your connection and try again." };
  }
  if (res.status === 401) return { ok: false, reason: "server", message: "Please sign in again to buy a Streak Shield." };
  const body: PurchaseReply = await res.json().catch(() => ({}));
  // Whatever the answer, the server's wallet is the truth: show it.
  if (body.snapshot && typeof body.snapshot.balance === "number") applySnapshot(store, body.snapshot, new Set(), deps.now());
  if (res.ok && body.ok) return { ok: true, duplicate: body.duplicate === true };
  return { ok: false, reason: body.reason ?? "server", message: body.message ?? "Something went wrong. Nothing was bought." };
}
