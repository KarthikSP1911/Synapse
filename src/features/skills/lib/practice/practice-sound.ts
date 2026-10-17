import { createSoundPlayer, type SoundPlayer } from "@/lib/sound";

/**
 * Sound for skill practice: the countdown cues and, in a session, a short cue after each answer. The choice is the app-wide sound
 * setting (`src/lib/sound-preference.ts`) and defaults to on.
 */

export { loadSoundPreference as loadPracticeSound, saveSoundPreference as savePracticeSound } from "@/lib/sound-preference";

let shared: SoundPlayer | null = null;

/**
 * One player for the whole visit. The Start button unlocks its audio, and the practice screen that opens next
 * (a client-side navigation, so this module stays loaded) can keep playing through the same unlocked context.
 */
export function practiceSoundPlayer(): SoundPlayer {
  shared ??= createSoundPlayer(true);
  return shared;
}
