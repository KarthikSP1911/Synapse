import { game2048Grants } from "@/features/rewards/lib/grants";
import type { Grant } from "@/features/rewards/lib/types";
import { game2048Counts } from "@/features/progress/lib/streak";
import type { SessionData } from "./types";

/**
 * The coins a saved 2048 run earns, once, by its highest tile. Only a run that counts as played gets anything (it ended,
 * reached 2048 or had enough moves, the same rule the streak uses), so starting a game and leaving earns nothing. Used on
 * the device and by the upload route.
 */
export const sessionGrants = (data: SessionData): Grant[] => game2048Grants(data, game2048Counts(data));
