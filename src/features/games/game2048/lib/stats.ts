import { WIN_TILE, type SessionData } from "./types";

/** Progress figures over every game that ended or was given up. */

interface TileCount {
  tile: number;
  /** Games whose highest tile was exactly this. */
  games: number;
}

export interface Stats2048 {
  gamesPlayed: number;
  /** Games that reached the 2048 tile. */
  gamesWon: number;
  /** Whole percent of games that reached 2048. */
  winRate: number;
  highScore: number;
  averageScore: number;
  /** The largest tile any game made; 0 with no games. */
  bestTile: number;
  totalMoves: number;
  /** Playing time over all games, in milliseconds. */
  totalDurationMs: number;
  /** Highest tile reached, most common first by tile size (largest first). */
  byTile: TileCount[];
  /** Newest first. */
  recent: SessionData[];
}

export function computeStats(sessions: readonly SessionData[], recentCount = 10): Stats2048 {
  const tiles = new Map<number, number>();
  let won = 0;
  let scoreTotal = 0;
  let highScore = 0;
  let bestTile = 0;
  let totalMoves = 0;
  let totalDurationMs = 0;
  for (const s of sessions) {
    tiles.set(s.highestTile, (tiles.get(s.highestTile) ?? 0) + 1);
    if (s.reached2048 || s.highestTile >= WIN_TILE) won++;
    scoreTotal += s.score;
    highScore = Math.max(highScore, s.score);
    bestTile = Math.max(bestTile, s.highestTile);
    totalMoves += s.moves;
    totalDurationMs += s.durationMs;
  }
  return {
    gamesPlayed: sessions.length,
    gamesWon: won,
    winRate: sessions.length === 0 ? 0 : Math.floor((won * 100) / sessions.length),
    highScore,
    averageScore: sessions.length === 0 ? 0 : Math.round(scoreTotal / sessions.length),
    bestTile,
    totalMoves,
    totalDurationMs,
    byTile: [...tiles.entries()].sort(([a], [b]) => b - a).map(([tile, games]) => ({ tile, games })),
    recent: [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, recentCount),
  };
}
