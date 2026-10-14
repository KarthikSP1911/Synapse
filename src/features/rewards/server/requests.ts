import { isObject } from "@/lib/records";
import { hintKey, isValidKey } from "@/features/rewards/lib/ledger";
import { MAX_HINT_INTENTS, MAX_PENDING_KEYS } from "@/features/rewards/lib/limits";
import type { HintIntent } from "@/features/rewards/server/wallet";

/**
 * What the wallet routes accept from a device. Nothing here names an amount: a device says WHAT happened (this hint of this
 * game was delivered, I would like to buy a shield) and the server decides what it costs.
 */

export interface SyncRequest {
  hints: HintIntent[];
  /** Keys of the device's unconfirmed entries, so the reply can say which the server already holds. */
  pendingKeys: string[];
}

export function parseSyncRequest(body: Record<string, unknown> | null): { ok: true; request: SyncRequest } | { ok: false; error: string } {
  if (!body) return { ok: false, error: "Expected a JSON object." };
  const rawHints = body.hints ?? [];
  const rawKeys = body.pendingKeys ?? [];
  if (!Array.isArray(rawHints) || !Array.isArray(rawKeys)) return { ok: false, error: "Expected { hints: [...], pendingKeys: [...] }." };
  if (rawHints.length > MAX_HINT_INTENTS || rawKeys.length > MAX_PENDING_KEYS) return { ok: false, error: "Too many items in one request." };

  const hints: HintIntent[] = [];
  for (const item of rawHints) {
    if (!isObject(item) || typeof item.chargeScope !== "string" || typeof item.ordinal !== "number" || typeof item.at !== "number") return { ok: false, error: "Invalid hint entry." };
    // The key is derived from the scope and ordinal, never taken from the device, so a hint cannot be filed under another identity.
    if (!Number.isSafeInteger(item.ordinal) || item.ordinal < 1 || !isValidKey(hintKey(item.chargeScope, item.ordinal))) return { ok: false, error: "Invalid hint entry." };
    hints.push({ chargeScope: item.chargeScope, ordinal: item.ordinal, at: item.at });
  }
  const pendingKeys = rawKeys.filter((k): k is string => typeof k === "string" && isValidKey(k));
  return { ok: true, request: { hints, pendingKeys } };
}

export const PURCHASE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function parsePurchaseRequest(body: Record<string, unknown> | null): { ok: true; id: string } | { ok: false; error: string } {
  if (!body || typeof body.id !== "string" || !PURCHASE_ID.test(body.id)) return { ok: false, error: "Expected { id } with an 8 to 64 character token." };
  return { ok: true, id: body.id };
}
