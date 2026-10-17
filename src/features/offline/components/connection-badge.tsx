"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStatus } from "@/features/offline/lib/sync/status";

/**
 * Tells the user when practice is only saved on this device. Hidden while everything is up to date, so
 * it only appears when there is something worth knowing.
 */
export function ConnectionBadge({ className }: { className?: string }) {
  const { online, syncing, pending, failed } = useSyncStatus();
  const waiting = pending > 0 ? `${pending} ${pending === 1 ? "session" : "sessions"} waiting to sync` : null;

  let label: string | null = null;
  let hint = "";
  if (!online) {
    label = "Offline";
    hint = `You are offline. Practice still works and is saved on this device${waiting ? ` (${waiting})` : ""}.`;
  } else if (syncing) {
    label = "Syncing…";
    hint = "Sending your practice to your account.";
  } else if (waiting) {
    label = failed ? "Sync paused" : "Waiting to sync";
    hint = `${waiting}. ${failed ? "Synapse will try again shortly." : ""}`.trim();
  }
  if (!label) return null;
  // "Syncing…" and "Waiting to sync" come and go every minute as the app quietly uploads, which is noise on a phone's crowded header.
  // On phones only the states that need the user's attention show: offline, and sync paused (uploads keep failing).
  const routine = online && (syncing || (pending > 0 && !failed));

  const Icon = online ? RefreshCw : CloudOff;
  return (
    <span
      role="status"
      title={hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        routine && "max-sm:hidden",
        className
      )}
    >
      <Icon className={cn("size-3", syncing && "animate-spin")} aria-hidden />
      <span>{label}</span>
      {pending > 0 && <span className="font-mono tabular-nums">· {pending}</span>}
      <span className="sr-only">{hint}</span>
    </span>
  );
}
