import type { NBackConfig, StreamId, Trial } from "./types";

/**
 * What a stimulus looks like. The generator only deals in indices; these tables turn an index into a colour or a
 * letter. They are part of the game's look, not of its rules, so changing them never changes scoring.
 */

/**
 * Letters, in the order they are brought into play. Chosen so letters that are easily confused (I and L, O and Q,
 * M and W, E and F, B and 8) are not both in the first few, and so no letter is a digit lookalike.
 */
export const LETTER_ORDER = ["H", "S", "T", "K", "C", "L", "W", "Z", "R", "Q"] as const;

export const letterAt = (index: number): string => LETTER_ORDER[index] ?? "?";

export interface StimulusColor {
  name: string;
  /** Fill of the lit cell. */
  fill: string;
  /** Colour of the letter on it, chosen for at least 4.5:1 contrast with the fill. */
  ink: string;
}

/**
 * Eight fills, picked from the Okabe-Ito set (which stays distinguishable for the common kinds of colour blindness)
 * plus a violet. They are listed in the order they come into play, so the first three are the most different from
 * each other and the colours that look alike (blue and sky, orange and red) only appear when many are in use.
 * The lit cell also has an outline, so even yellow reads on a pale board.
 */
export const STIMULUS_COLORS: readonly StimulusColor[] = [
  { name: "Blue", fill: "#0072B2", ink: "#FFFFFF" },
  { name: "Orange", fill: "#E69F00", ink: "#111111" },
  { name: "Green", fill: "#009E73", ink: "#111111" },
  { name: "Pink", fill: "#CC79A7", ink: "#111111" },
  { name: "Yellow", fill: "#F0E442", ink: "#111111" },
  { name: "Violet", fill: "#6D28D9", ink: "#FFFFFF" },
  { name: "Sky", fill: "#56B4E9", ink: "#111111" },
  { name: "Red", fill: "#D55E00", ink: "#111111" },
];

export const colorAt = (index: number): StimulusColor => STIMULUS_COLORS[index] ?? STIMULUS_COLORS[0];

/** The cell the stimulus sits in when Position is off: the middle one (the lower right of the middle four on an even board). */
export const fixedCell = (grid: number): number => Math.floor(grid / 2) * grid + Math.floor(grid / 2);

/** How many values a stream can take, given the settings. */
export function domainSize(stream: StreamId, config: Pick<NBackConfig, "grid" | "colors" | "letters">): number {
  return stream === "position" ? config.grid * config.grid : stream === "color" ? config.colors : config.letters;
}

/** What is on screen during one trial, in terms a board can draw. */
export interface Stimulus {
  cell: number;
  /** Fill colour of the lit cell; null means "use the game's neutral accent" (Color is off). */
  color: StimulusColor | null;
  /** The letter in the cell; null when Letter is off. */
  letter: string | null;
}

export function stimulusFor(trial: Trial, config: Pick<NBackConfig, "streams">): Stimulus {
  return {
    cell: trial.values.position,
    color: config.streams.color ? colorAt(trial.values.color) : null,
    letter: config.streams.letter ? letterAt(trial.values.letter) : null,
  };
}

/** "Position 5, blue, letter K": the stimulus in words, for screen readers. */
export function describeStimulus(stimulus: Stimulus, grid: number): string {
  const row = Math.floor(stimulus.cell / grid) + 1;
  const col = (stimulus.cell % grid) + 1;
  return [`Row ${row}, column ${col}`, stimulus.color?.name, stimulus.letter ? `letter ${stimulus.letter}` : null].filter(Boolean).join(", ");
}

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b2] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
