import { roundGameGrants } from "@/features/rewards/lib/grants";
import type { Grant } from "@/features/rewards/lib/types";
import { scoreRound } from "./scoring";
import type { SessionData } from "./types";

/** The coins a finished MindSprint session earns: per correct round, plus the session bonus. Used on the device and by the upload route. */
export const sessionGrants = (data: SessionData): Grant[] =>
  roundGameGrants("mindsprint", { clientId: data.clientId, endedAt: data.endedAt, rounds: data.rounds.map((round) => scoreRound(round).correct) });
