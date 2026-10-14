import { createLocalHistory, type Stored } from "@/features/games/shared/lib/history/local";
import { dataOrNull } from "@/lib/records";
import { defaultConfig, parseConfig } from "./config";
import { parseSessionData } from "./records";
import { sessionGrants } from "./rewards";
import { RECALL_MODES, type RecallConfig, type RecallMode, type SessionData } from "./types";

/**
 * Number Recall history on this device (see `src/features/games/shared/lib/history/local.ts` for how it is kept and trimmed), plus the
 * settings and sound choice the player last made.
 */

export type StoredSession = Stored<SessionData>;

export const recallHistory = createLocalHistory<SessionData>({
  suffix: "recall",
  parse: dataOrNull(parseSessionData),
  grants: sessionGrants,
});

export const loadHistory = recallHistory.load;
export const saveSession = recallHistory.save;

// ---------------------------------------------------------------------------
// Remembered settings (one set per mode, because the sensible lengths differ)
// ---------------------------------------------------------------------------

const SETUP_KEY = "mathz:recall:setup";
const MODE_KEY = "mathz:recall:mode";
const SOUND_KEY = "mathz:recall:sound";

export const defaultSetups = (): Record<RecallMode, RecallConfig> => ({ single: defaultConfig("single"), pair: defaultConfig("pair") });

/** The settings the player last used for each mode; anything missing or invalid falls back to the defaults. */
export function loadSetups(): Record<RecallMode, RecallConfig> {
  const setups = defaultSetups();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      for (const mode of RECALL_MODES) {
        const parsed = parseConfig((raw as Record<string, unknown>)[mode]);
        if (parsed.ok && parsed.config.mode === mode) setups[mode] = parsed.config;
      }
    }
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return setups;
}

export function saveSetups(setups: Record<RecallMode, RecallConfig>): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setups));
  } catch {
    // Remembering the settings is a convenience only.
  }
}

export function loadMode(): RecallMode {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    return RECALL_MODES.includes(mode as RecallMode) ? (mode as RecallMode) : "single";
  } catch {
    return "single";
  }
}

export function saveMode(mode: RecallMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Remembering the mode is a convenience only.
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
