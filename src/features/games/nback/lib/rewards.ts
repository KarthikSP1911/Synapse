import { puzzleGrants } from "@/features/rewards/lib/grants";
import type { Grant } from "@/features/rewards/lib/types";
import { difficultyOf } from "./difficulty";
import type { SessionData } from "./types";

/**
 * The coins a saved N-Back session earns: the difficulty's reward from the shared economy (`ECONOMY.puzzle`) for a
 * session played to the end, nothing for Game Over. A quit session is never saved, so it never gets here. The reward
 * key is made from the session id, so saving, syncing or reloading the same session pays once. Used on the device and by the upload route.
 */
export const sessionGrants = (data: SessionData): Grant[] =>
  puzzleGrants("nback", { clientId: data.clientId, completed: data.outcome === "completed", difficulty: difficultyOf(data.config), endedAt: data.endedAt });
