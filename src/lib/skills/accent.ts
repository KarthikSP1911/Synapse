import type { Skill } from "./types";

/** Games and skills each own one accent colour. No React here, so server and client share it. */
export type AccentId = Skill | "mindsprint" | "recall" | "sudoku";

/** The one place accent colours are defined. Tiles, outlines and selected labels all read from this. */
export const ACCENT: Record<AccentId, string> = {
  multiplication: "#50A8F5",
  addition: "#FFD60A",
  subtraction: "#FF5C67",
  division: "#19C982",
  percentage: "#A855F7",
  fraction: "#06B6D4",
  square: "#F97316",
  exponents: "#EC4899",
  mindsprint: "#F59E0B",
  recall: "#818CF8",
  sudoku: "#2DD4BF",
};
