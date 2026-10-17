import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { dataOrNull } from "@/lib/records";
import { DEFAULT_SETUP, copyRound, parseSetup, type MindSprintSetup } from "./config";
import { parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import type { SessionData } from "./types";

/**
 * MindSprint history on this device (see `src/features/games/shared/lib/history/local.ts` for how it is kept and trimmed), plus the
 * setup and sound choice the player last made.
 */

export { MAX_STORED_SESSIONS } from "@/features/games/shared/lib/history/local";

export type StoredSession = Stored<SessionData>;

export const mindsprintHistory = createLocalHistory<SessionData>({
  suffix: "mindsprint",
  parse: dataOrNull(parseSessionData),
  grants: sessionGrants,
});

export const loadHistory = mindsprintHistory.load;
export const saveSession = mindsprintHistory.save;
export const pendingSessions = mindsprintHistory.pending;
export const markSynced = mindsprintHistory.markSynced;
export const mergeRemote = mindsprintHistory.mergeRemote;

// ---------------------------------------------------------------------------
// Remembered setup
// ---------------------------------------------------------------------------

const SETUP_KEY = "mathz:mindsprint:setup";

export const defaultSetup = (): MindSprintSetup => ({ config: copyRound(DEFAULT_SETUP.config), rounds: DEFAULT_SETUP.rounds });

/** The settings and round count the player last used, or the defaults. */
export function loadSetup(): MindSprintSetup {
  try {
    return parseSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null")) ?? defaultSetup();
  } catch {
    return defaultSetup();
  }
}

export function saveSetup(setup: MindSprintSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // Remembering the setup is a convenience only.
  }
}

export { loadSoundPreference as loadSound, saveSoundPreference as saveSound } from "@/lib/sound-preference";
