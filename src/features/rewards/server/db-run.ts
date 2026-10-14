import { db } from "@/db";
import type { Run } from "@/features/rewards/server/wallet";

/** The wallet's SQL, run on the app's database. Kept apart from `wallet.ts` so that module can also run on a test database. */
export const dbRun: Run = async (query) => {
  const result: unknown = await db.execute(query);
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows;
  return (rows ?? []) as Record<string, unknown>[];
};
