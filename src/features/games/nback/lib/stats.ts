import { analyze } from "./analysis";
import { MODE_LABEL, STREAM_MODES, type SessionData, type StreamMode } from "./types";

export interface ModeStats {
  sessions: number;
  completed: number;
  gameOvers: number;
  /** Highest n completed with accuracy at or above the line; 0 when none. */
  bestN: number;
  bestScore: number;
  /** Mean overall accuracy over the completed sessions, percent rounded; null when none. */
  averageAccuracy: number | null;
}

export interface NBackStats {
  all: ModeStats;
  byMode: Record<StreamMode, ModeStats>;
}

function summarize(sessions: readonly SessionData[]): ModeStats {
  let completed = 0;
  let gameOvers = 0;
  let bestN = 0;
  let bestScore = 0;
  let accuracySum = 0;
  for (const session of sessions) {
    const a = analyze(session);
    if (session.outcome === "completed") {
      completed++;
      accuracySum += a.accuracy;
    } else gameOvers++;
    if (a.setsBestN) bestN = Math.max(bestN, session.config.n);
    bestScore = Math.max(bestScore, a.points);
  }
  return { sessions: sessions.length, completed, gameOvers, bestN, bestScore, averageAccuracy: completed === 0 ? null : Math.round(accuracySum / completed) };
}

export function computeStats(sessions: readonly SessionData[]): NBackStats {
  const byMode = Object.fromEntries(STREAM_MODES.map((mode) => [mode, summarize(sessions.filter((s) => analyze(s).mode === mode))])) as Record<StreamMode, ModeStats>;
  return { all: summarize(sessions), byMode };
}

/** One point on the progress charts. */
export interface ProgressPoint {
  /** 1-based position among the plotted sessions, oldest first. */
  index: number;
  endedAt: number;
  accuracy: number;
  n: number;
  mode: StreamMode;
  outcome: SessionData["outcome"];
}

/** Sessions oldest first, optionally only those of one stream mode: accuracy (percent, rounded) and n over time. */
export function progressPoints(sessions: readonly SessionData[], mode: StreamMode | "all" = "all"): ProgressPoint[] {
  return [...sessions]
    .sort((a, b) => a.endedAt - b.endedAt)
    .filter((s) => mode === "all" || analyze(s).mode === mode)
    .map((s, i) => ({ index: i + 1, endedAt: s.endedAt, accuracy: Math.round(analyze(s).accuracy), n: s.config.n, mode: analyze(s).mode, outcome: s.outcome }));
}

/** The line on a game card: the best n reached over all modes, or why there is none. Null when the game was never played. */
export function hubSummary(stats: NBackStats): string | null {
  if (stats.all.sessions === 0) return null;
  const best = STREAM_MODES.reduce<{ mode: StreamMode; n: number } | null>((top, mode) => (stats.byMode[mode].bestN > (top?.n ?? 0) ? { mode, n: stats.byMode[mode].bestN } : top), null);
  return best ? `Best n ${best.n} · ${MODE_LABEL[best.mode].toLowerCase()}` : "No best n yet";
}
