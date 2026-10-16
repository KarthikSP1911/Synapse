import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { nbackCounts } from "@/features/progress/lib/streak";
import { dataOrNull } from "@/lib/records";
import { readSettings } from "./config";
import { parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import { DEFAULT_CONFIG, type NBackConfig, type SessionData } from "./types";

/**
 * N-Back data on this device: finished sessions (completed or Game Over; a quit session is never saved), kept and
 * uploaded like the other games' history (see `src/features/games/shared/lib/history/local.ts`), and the settings
 * the player last used. Saving a session also pays its coins and notes the day for the streak, both once per
 * session id, so saving it twice changes nothing.
 */

export type StoredSession = Stored<SessionData>;

export const nbackHistory = createLocalHistory<SessionData>({
  suffix: "nback",
  parse: dataOrNull(parseSessionData),
  countsAsActivity: nbackCounts,
  grants: sessionGrants,
});

export const loadHistory = nbackHistory.load;
export const saveSession = nbackHistory.save;

const SETTINGS_KEY = "mathz:nback:settings";
const TUTORIAL_KEY = "mathz:nback:tutorial";

/** The settings the player last used; anything missing or invalid falls back to the defaults. */
export function loadSettings(): NBackConfig {
  try {
    return readSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveSettings(config: NBackConfig): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
  } catch {
    // Remembering the settings is a convenience only.
  }
}

/** Whether the "how it works" walkthrough has been shown before. */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "seen";
  } catch {
    // Storage blocked: do not nag on every start.
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, "seen");
  } catch {
    // Showing it again next time is harmless.
  }
}
