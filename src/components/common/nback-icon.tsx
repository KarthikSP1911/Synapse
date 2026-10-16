import { createLucideIcon } from "lucide-react";

/**
 * The N-Back symbol: a two-by-two grid whose first cell holds a back arrow ("the one from n steps ago"). Built with
 * Lucide's own factory, so it takes the same size, stroke and colour props as every other icon on the tiles.
 */
export const NBackIcon = createLucideIcon("n-back", [
  ["path", { d: "M10 7H4.5", key: "arrow-shaft" }],
  ["path", { d: "M7.5 3.5 4 7l3.5 3.5", key: "arrow-head" }],
  ["rect", { x: "14", y: "3", width: "7", height: "7", rx: "1.5", key: "top-right" }],
  ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1.5", key: "bottom-left" }],
  ["rect", { x: "14", y: "14", width: "7", height: "7", rx: "1.5", key: "bottom-right" }],
]);
