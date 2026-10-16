import type { StreamId } from "./types";

/** One key per stream, chosen so they sit under one hand and clash with nothing else in the app. */
export const STREAM_KEY: Record<StreamId, string> = { position: "A", color: "S", letter: "L" };

/** The stream a key press marks, or null. Case does not matter. */
export function streamForKey(key: string): StreamId | null {
  const upper = key.length === 1 ? key.toUpperCase() : "";
  return (Object.keys(STREAM_KEY) as StreamId[]).find((stream) => STREAM_KEY[stream] === upper) ?? null;
}
