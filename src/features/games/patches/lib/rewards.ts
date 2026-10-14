import { puzzleGrants } from "@/features/rewards/lib/grants";
import type { Grant } from "@/features/rewards/lib/types";
import type { SessionData } from "./types";

/** The coins a saved Patches game earns: the difficulty's reward for a solved puzzle, nothing otherwise. Used on the device and by the upload route. */
export const sessionGrants = (data: SessionData): Grant[] => puzzleGrants("patches", data);
