import { NextResponse } from "next/server";
import { serverFailure } from "@/lib/http";
import { getCurrentUser, unauthorized } from "@/features/auth/server/auth";
import { dbRun } from "@/features/rewards/server/db-run";
import { getSnapshot } from "@/features/rewards/server/wallet";

export const dynamic = "force-dynamic";

/** The signed-in user's wallet: balance, Streak Shields, protected days and the latest transactions. Read-only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json({ snapshot: await getSnapshot(dbRun, user.id) });
  } catch (error) {
    return serverFailure("Failed to load the wallet", error, { route: "/api/wallet", method: "GET" });
  }
}
