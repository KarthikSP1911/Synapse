import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { dayKey } from "@/features/progress/lib/activity";
import { getActivityDays } from "@/features/progress/server/progress-queries";
import { hintKey } from "@/features/rewards/lib/ledger";
import { dbRun } from "@/features/rewards/server/db-run";
import { parseSyncRequest } from "@/features/rewards/server/requests";
import { chargeHintIntent, getSnapshot, knownKeys, protectStreak } from "@/features/rewards/server/wallet";
import { readJson } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Body: { hints: [{ chargeScope, ordinal, at }], pendingKeys: [...] }.
 *
 * Settles a device's wallet with the account's: charges the hints the device delivered since its last sync (at the server's
 * price, each hint once), uses a Streak Shield on any missed day one can cover (deciding from every day the account has
 * recorded), and answers with the account's wallet. The reply's `known` lists which of `pendingKeys` the server already
 * holds (earnings are credited when the sessions that earned them are uploaded, not by this route), `rejected` the hint
 * charges it refused.
 *
 * Idempotent: every effect has a key, so a request that is retried, repeated or sent by two tabs at once changes nothing the second time.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const parsed = parseSyncRequest(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const applied: string[] = [];
    const rejected: { key: string; reason: string }[] = [];
    for (const intent of parsed.request.hints) {
      const result = await chargeHintIntent(dbRun, user.id, intent);
      const key = hintKey(intent.chargeScope, intent.ordinal);
      if (result.ok) applied.push(key);
      else rejected.push({ key, reason: result.reason });
    }

    const activeDays = new Set(await getActivityDays(user.id, user.timezone));
    const protectedDays = await protectStreak(dbRun, user.id, { activeDays, today: dayKey(new Date(), user.timezone) });

    const known = await knownKeys(dbRun, user.id, parsed.request.pendingKeys);
    return NextResponse.json({ snapshot: await getSnapshot(dbRun, user.id), applied, rejected, known, protectedDays });
  } catch (error) {
    console.error("Failed to sync the wallet:", error);
    return NextResponse.json({ error: "Failed to sync the wallet" }, { status: 500 });
  }
}
