"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useLocalStore } from "@/features/auth/components/viewer-provider";
import { balanceOf, emptyWallet } from "@/features/rewards/lib/ledger";
import type { Wallet } from "@/features/rewards/lib/types";
import { loadWallet, subscribeWallet } from "@/features/rewards/lib/wallet-store";
import type { LocalStore } from "@/features/offline/lib/guest/api";

const EMPTY = emptyWallet("none");
const noopSubscribe = () => () => {};

/** False while the server renders and during hydration, true afterwards, so wallet figures never cause a hydration mismatch. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export interface WalletView {
  /** The viewer's local store; null when nobody is signed in. */
  store: LocalStore | null;
  wallet: Wallet;
  balance: number;
  /** Streak Shields owned. */
  shields: number;
  /** False until the browser's copy has been read. */
  ready: boolean;
}

/**
 * The viewer's wallet, kept live: it re-renders when coins change in this tab or another, and reads the same saved wallet
 * the games write to. Before hydration it reports an empty wallet and `ready: false`.
 */
export function useWallet(): WalletView {
  const store = useLocalStore();
  const ready = useHydrated();
  const subscribe = useCallback((onChange: () => void) => (store ? subscribeWallet(store, onChange) : () => {}), [store]);
  const wallet = useSyncExternalStore(
    subscribe,
    () => (store ? loadWallet(store) : EMPTY),
    () => EMPTY
  );
  return { store, wallet, balance: balanceOf(wallet), shields: wallet.shields.length, ready: ready && store !== null };
}
