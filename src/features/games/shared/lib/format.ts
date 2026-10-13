/** "3.2s": a response or answer time. */
export const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** "about 45 sec" or "about 3 min": a rough length for a game that is about to start. */
export const formatApproxDuration = (seconds: number): string => (seconds < 90 ? `about ${Math.round(seconds / 5) * 5} sec` : `about ${Math.round(seconds / 60)} min`);
