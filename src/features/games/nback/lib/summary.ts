import { ECONOMY } from "@/features/rewards/lib/economy";
import { formatApproxDuration } from "@/features/games/shared/lib/format";
import { difficultyOf } from "./difficulty";
import { activeStreams, scoreableTrials } from "./config";
import { STREAMS, STREAM_LABEL, type NBackConfig, type StreamId } from "./types";

/** The quick-start modes: how many streams are tracked at once. "custom" is any other combination of streams. */
export const MODE_PRESETS = [
  { id: "single", label: "Single", detail: "Position", description: "One stream: which cell lights up.", streams: ["position"] },
  { id: "dual", label: "Dual", detail: "Position + Color", description: "Two streams at once: where it lights up and what color it is.", streams: ["position", "color"] },
  { id: "triple", label: "Triple", detail: "All three", description: "Position, color and the letter inside the cell, all at once.", streams: ["position", "color", "letter"] },
] as const satisfies readonly { id: string; label: string; detail: string; description: string; streams: readonly StreamId[] }[];

export type ModePresetId = (typeof MODE_PRESETS)[number]["id"] | "custom";

const streamsOf = (ids: readonly StreamId[]): NBackConfig["streams"] => ({ position: ids.includes("position"), color: ids.includes("color"), letter: ids.includes("letter") });

/** The streams a preset turns on. Everything else in the settings is left as the player has it. */
export const presetStreams = (id: Exclude<ModePresetId, "custom">): NBackConfig["streams"] => streamsOf(MODE_PRESETS.find((p) => p.id === id)!.streams);

/** The preset whose streams these are exactly, or "custom". */
export function modeOf(config: Pick<NBackConfig, "streams">): ModePresetId {
  const on = activeStreams(config);
  return MODE_PRESETS.find((p) => {
    const ids: readonly StreamId[] = p.streams;
    return ids.length === on.length && STREAMS.every((s) => ids.includes(s) === on.includes(s));
  })?.id ?? "custom";
}

/** The settings in one sentence: "2-back, Position + Color, 5×5, about 2 min, 15 coins." */
export function summarizeConfig(config: NBackConfig): string {
  const streams = activeStreams(config);
  const parts = [
    `${config.n}-back`,
    streams.map((s) => STREAM_LABEL[s]).join(" + "),
    config.streams.position ? `${config.grid}×${config.grid}` : null,
    config.unlimited ? "no set length" : `${config.trials} flashes (${scoreableTrials(config)} scored)`,
    config.unlimited ? null : formatApproxDuration((config.trials * config.trialMs) / 1000 + 3),
    `${ECONOMY.puzzle[difficultyOf(config)]} coins`,
  ];
  return parts.filter(Boolean).join(", ") + ".";
}
