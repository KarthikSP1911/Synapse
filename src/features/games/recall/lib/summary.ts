import { formatApproxDuration } from "@/features/games/shared/lib/format";
import { COUNT_STEP_MS, GO_MS } from "@/lib/timeline";
import { ITEM_NAME, type RecallConfig } from "./types";

/** Rough length of a session in seconds: countdown, items and a few seconds to type each round. */
export function estimateSeconds(config: RecallConfig): number {
  const ANSWER_SECONDS = 8;
  return config.rounds * ((config.countdown * COUNT_STEP_MS + GO_MS + config.length * (config.displayMs + config.gapMs)) / 1000 + ANSWER_SECONDS);
}

/** The settings in one sentence: "5 rounds of 6 digits, partial credit, about 3 min." */
export function summarizeConfig(config: RecallConfig): string {
  const [one, many] = ITEM_NAME[config.mode];
  const rounds = `${config.rounds} ${config.rounds === 1 ? "round" : "rounds"} of ${config.length} ${config.length === 1 ? one : many}`;
  return [rounds, config.progressive ? "one longer after each perfect round" : null, config.partialCredit ? "partial credit" : "all or nothing", formatApproxDuration(estimateSeconds(config))].filter(Boolean).join(", ") + ".";
}
