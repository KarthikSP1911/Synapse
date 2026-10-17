/**
 * The one sound setting for the whole app, kept on this device. Practice, MindSprint and Number Recall used to each remember their own;
 * a device that muted any of them stays muted until the new setting is chosen, so nobody is surprised by sound they turned off.
 */

export const SOUND_KEY = "mathz:sound";
const LEGACY_KEYS = ["mathz:practice:sound", "mathz:mindsprint:sound", "mathz:recall:sound"] as const;

export function loadSoundPreference(): boolean {
  try {
    const saved = localStorage.getItem(SOUND_KEY);
    if (saved !== null) return saved !== "off";
    return !LEGACY_KEYS.some((key) => localStorage.getItem(key) === "off");
  } catch {
    return true;
  }
}

export function saveSoundPreference(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Remembering the choice is a convenience only.
  }
}
