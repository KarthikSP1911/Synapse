/**
 * Game sounds, synthesised with the Web Audio API so there are no audio files to load (and nothing to fail
 * offline). Browsers only allow sound after a tap or key press, so the player is `unlock`ed from the Start button.
 */

export type Cue = "tick" | "go" | "correct" | "wrong";

interface Note {
  /** Frequency in hertz. */
  freq: number;
  /** Seconds after the cue starts. */
  at: number;
  duration: number;
  type: OscillatorType;
  volume: number;
}

const CUES: Record<Cue, Note[]> = {
  tick: [{ freq: 660, at: 0, duration: 0.09, type: "sine", volume: 0.18 }],
  go: [
    { freq: 880, at: 0, duration: 0.12, type: "triangle", volume: 0.22 },
    { freq: 1320, at: 0.1, duration: 0.22, type: "triangle", volume: 0.22 },
  ],
  correct: [
    { freq: 523, at: 0, duration: 0.12, type: "sine", volume: 0.2 },
    { freq: 784, at: 0.1, duration: 0.2, type: "sine", volume: 0.2 },
  ],
  wrong: [{ freq: 196, at: 0, duration: 0.3, type: "triangle", volume: 0.2 }],
};

export interface SoundPlayer {
  /** Call from a user gesture; creates (or resumes) the audio context. */
  unlock: () => void;
  play: (cue: Cue) => void;
  setEnabled: (enabled: boolean) => void;
  close: () => void;
}

export function createSoundPlayer(enabled: boolean): SoundPlayer {
  let context: AudioContext | null = null;
  let on = enabled;

  const getContext = (): AudioContext | null => {
    if (context) return context;
    const Ctor = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      context = null;
    }
    return context;
  };

  return {
    unlock() {
      const ctx = getContext();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    },
    play(cue) {
      const ctx = on ? getContext() : null;
      if (!ctx || ctx.state !== "running") return;
      const start = ctx.currentTime;
      for (const note of CUES[cue]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type;
        osc.frequency.value = note.freq;
        const from = start + note.at;
        // A short fade in and out keeps the tones from clicking.
        gain.gain.setValueAtTime(0.0001, from);
        gain.gain.exponentialRampToValueAtTime(note.volume, from + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, from + note.duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(from);
        osc.stop(from + note.duration + 0.02);
      }
    },
    setEnabled(next) {
      on = next;
    },
    close() {
      context?.close().catch(() => {});
      context = null;
    },
  };
}
