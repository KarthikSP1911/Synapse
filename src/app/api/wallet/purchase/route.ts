import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { dayKey } from "@/features/progress/lib/activity";
import { dbRun } from "@/features/rewards/server/db-run";
import { parsePurchaseRequest } from "@/features/rewards/server/requests";
import { getSnapshot, purchaseShield } from "@/features/rewards/server/wallet";
import { readJson } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Body: { id } - a token the browser makes once per purchase attempt and reuses if it has to retry.
 *
 * Buys one Streak Shield at the server's price. The price, the inventory limit and the balance are all checked here, in
 * the same statement that records the purchase, so repeated clicks, retries and parallel requests buy it once and can
 * never spend the balance twice. Reply: { ok: true, duplicate, snapshot } or, with status 409, { ok: false, reason, message, snapshot }.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const parsed = parsePurchaseRequest(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ ok: false, reason: "invalid", message: parsed.error }, { status: 400 });

  try {
    const result = await purchaseShield(dbRun, user.id, { id: parsed.id, today: dayKey(new Date(), user.timezone) });
    const snapshot = await getSnapshot(dbRun, user.id);
    return NextResponse.json({ ...result, snapshot }, { status: result.ok ? 200 : result.reason === "invalid" ? 400 : 409 });
  } catch (error) {
    console.error("Failed to buy a Streak Shield:", error);
    return NextResponse.json({ ok: false, reason: "server", message: "Something went wrong. Nothing was bought." }, { status: 500 });
  }
}
