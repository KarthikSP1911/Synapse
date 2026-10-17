import { createSoundPlayer, type SoundPlayer } from "@/lib/sound";
import { loadPracticeSound } from "@/features/skills/lib/practice/practice-sound";

/**
 * "Time's up": one beep (unless muted) and a vibration where the device supports it. Browsers only let sound start after a
 * tap, so the player is unlocked when the timer is started; after a page refresh the beep can stay silent until the next
 * tap, which is why the banner, not the beep, is the signal that always arrives.
 */

let player: SoundPlayer | null = null;

function getPlayer(): SoundPlayer {
  player ??= createSoundPlayer(true);
  return player;
}

/** Call from a tap (starting the timer). */
export function unlockAlertSound(): void {
  getPlayer().unlock();
}

/** The vibration pattern: two short pulses. A silent no-op where `navigator.vibrate` is missing or refused. */
function vibrate(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([200, 100, 200]);
  } catch {
    // Some browsers throw without a recent tap; the banner still shows.
  }
}

/**
 * `soundOn` is the setting of the area the user is in (practice, MindSprint, Recall); null means no area has one (idle, or a
 * game without sound), which falls back to the practice setting. There is no separate mute for the timer.
 */
export function performAlert(soundOn: boolean | null): void {
  const audible = soundOn ?? loadPracticeSound();
  const sound = getPlayer();
  sound.setEnabled(audible);
  if (audible) sound.play("alert");
  vibrate();
}
