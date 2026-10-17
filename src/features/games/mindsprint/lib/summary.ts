import { formatApproxDuration } from "@/features/games/shared/lib/format";
import { COUNTDOWN_FROM, COUNT_STEP_MS, GO_MS } from "@/lib/timeline";
import { difficultyMultiplier, type MindSprintSetup } from "./config";
import { pointsFor } from "./scoring";
import { OPERATION_LABEL, OPERATIONS, type RoundConfig } from "./types";

/** Rough length of a session in seconds: a countdown, the flashes and a few seconds to answer, for every round. */
export function estimateSeconds(config: RoundConfig, rounds: number): number {
  const ANSWER_SECONDS = 6;
  return rounds * ((COUNTDOWN_FROM * COUNT_STEP_MS + GO_MS + config.flashes * (config.displayMs + config.gapMs)) / 1000 + ANSWER_SECONDS);
}

const DIGIT_WORDS = ["", "single-digit", "two-digit", "three-digit", "four-digit"];

/** The setup in one sentence: "5 rounds of 5 two-digit numbers, addition and subtraction, about 2 min, up to 700 points." */
export function summarizeSetup({ config, rounds }: MindSprintSetup): string {
  const ops = OPERATIONS.filter((op) => config.operations.includes(op)).map((op) => OPERATION_LABEL[op].toLowerCase());
  const operations = ops.length > 1 ? `${ops.slice(0, -1).join(", ")} and ${ops[ops.length - 1]}` : ops[0];
  const extras = [config.decimals ? "decimals" : null, config.allowNegative ? "negatives" : null].filter(Boolean);
  const numbers = `${DIGIT_WORDS[config.digits] ?? `${config.digits}-digit`} numbers`;
  const points = (rounds * pointsFor(difficultyMultiplier(config))).toLocaleString("en-US");
  return [`${rounds} ${rounds === 1 ? "round" : "rounds"} of ${config.flashes} ${numbers}`, operations, ...extras, formatApproxDuration(estimateSeconds(config, rounds)), `up to ${points} points`].join(", ") + ".";
}
