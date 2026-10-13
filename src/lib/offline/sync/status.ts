"use client";

import { useSyncExternalStore } from "react";

/** What the connection badge shows: whether the device is online, whether an upload is running, and how much is waiting. */
export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  /** Sessions with answers that the server has not confirmed yet. */
  pending: number;
  /** The last upload attempt failed (server or network); it will be retried. */
  failed: boolean;
}

// Until the browser says otherwise, assume online: this is also what the server render shows.
let status: SyncStatus = { online: true, syncing: false, pending: 0, failed: false };
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>): void {
  const next = { ...status, ...patch };
  if (next.online === status.online && next.syncing === status.syncing && next.pending === status.pending && next.failed === status.failed) return;
  status = next;
  listeners.forEach((l) => l());
}

export const getSyncStatus = (): SyncStatus => status;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverStatus: SyncStatus = { online: true, syncing: false, pending: 0, failed: false };

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSyncStatus, () => serverStatus);
}
