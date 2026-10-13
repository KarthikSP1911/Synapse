import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { dataOrNull } from "@/lib/records";
import { DEFAULT_ROUND, DEFAULT_ROUND_COUNT, parseSetup } from "./config";
import { parseSessionData } from "./records";
import type { RoundConfig, SessionData } from "./types";

/**
 * MindSprint history on this device (see `src/features/games/shared/lib/history/local.ts` for how it is kept and trimmed), plus the
 * setup and sound choice the player last made.
 */

export { MAX_STORED_SESSIONS } from "@/features/games/shared/lib/history/local";

export type StoredSession = Stored<SessionData>;

export const mindsprintHistory = createLocalHistory<SessionData>({
  suffix: "mindsprint",
  parse: dataOrNull(parseSessionData),
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
const SOUND_KEY = "mathz:mindsprint:sound";

export const defaultSetup = (): RoundConfig[] => Array.from({ length: DEFAULT_ROUND_COUNT }, () => ({ ...DEFAULT_ROUND, operations: [...DEFAULT_ROUND.operations] }));

/** The rounds the player last set up, or the defaults. */
export function loadSetup(): RoundConfig[] {
  try {
    return parseSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null")) ?? defaultSetup();
  } catch {
    return defaultSetup();
  }
}

export function saveSetup(rounds: readonly RoundConfig[]): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(rounds));
  } catch {
    // Remembering the setup is a convenience only.
  }
}

export function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSound(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Remembering the choice is a convenience only.
  }
}
