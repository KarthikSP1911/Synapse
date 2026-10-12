import { createSoundPlayer, type SoundPlayer } from "@/lib/mindsprint/sound";

/**
 * Sound for skill practice: the countdown cues and, in a session, a short cue after each answer. The choice is
 * remembered on this device, separately from the games' (`mathz:mindsprint:sound`), and defaults to on.
 */

export const PRACTICE_SOUND_KEY = "mathz:practice:sound";

export function loadPracticeSound(): boolean {
  try {
    return localStorage.getItem(PRACTICE_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function savePracticeSound(enabled: boolean): void {
  try {
    localStorage.setItem(PRACTICE_SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Remembering the choice is a convenience only.
  }
}

let shared: SoundPlayer | null = null;

/**
 * One player for the whole visit. The Start button unlocks its audio, and the practice screen that opens next
 * (a client-side navigation, so this module stays loaded) can keep playing through the same unlocked context.
 */
export function practiceSoundPlayer(): SoundPlayer {
  shared ??= createSoundPlayer(true);
  return shared;
}
