import { roundGameGrants } from "@/features/rewards/lib/grants";
import type { Grant } from "@/features/rewards/lib/types";
import { scoreSession } from "./scoring";
import type { SessionData } from "./types";

/** The coins a finished Number Recall session earns: per perfectly recalled round, plus the session bonus. Used on the device and by the upload route. */
export const sessionGrants = (data: SessionData): Grant[] =>
  roundGameGrants("recall", { clientId: data.clientId, endedAt: data.endedAt, rounds: scoreSession(data.config, data.rounds).rounds.map((round) => round.perfect) });
