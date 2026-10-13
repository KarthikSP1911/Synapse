import { compressSegments, decompressSegments } from "@/features/offline/lib/compression";
import { packData, unpackData } from "@/features/offline/lib/guest/pack";
import type { ItemStats } from "@/features/skills/lib/practice/item-stats";
import type { PracticeConfig, Outcome, Skill } from "@/features/skills/lib/types";

/**
 * Everything a guest has practised, kept in this browser's localStorage. Guests have no account, so
 * nothing here ever reaches the server or the database.
 *
 * The shapes mirror the database rows (`practice_sessions`, `question_attempts`, `question_stats`)
 * so the guest code can reuse the same logic as the signed-in code, but dates are epoch milliseconds
 * because JSON has no date type.
 */

export const GUEST_STORAGE_KEY = "mathz:guest:v1";
/** A signed-in user's offline copy lives under their own key, so two accounts on one device never mix. */
export const userStorageKey = (userId: number) => `mathz:user:v1:${userId}`;
/** Oldest sessions are dropped beyond this, so the data cannot grow without bound. */
export const MAX_GUEST_SESSIONS = 40;
/** Sessions still waiting to reach the server are kept past the usual limit, up to this many. */
export const MAX_UNSYNCED_SESSIONS = 200;
/** An endless session can run for hours; only its latest attempts are kept. */
export const MAX_ATTEMPTS_PER_SESSION = 400;

export interface GuestAttempt {
  questionId: string;
  skill: Skill;
  exerciseType: string;
  difficulty: string;
  prompt: string;
  correctAnswerText: string;
  userAnswerText: string | null;
  isCorrect: boolean;
  outcome: Outcome;
  hinted: boolean;
  responseTimeMs: number;
  at: number;
}

export interface GuestSession {
  id: number;
  /** Signed-in stores only: a random id the server uses to recognise a session it has already received. */
  clientId?: string;
  /** Signed-in stores only: false until the server has confirmed it holds this session. Absent means nothing to upload. */
  synced?: boolean;
  skill: Skill;
  mode: "fixed" | "endless" | "timed" | "review";
  focus: string;
  config: PracticeConfig | null;
  targetQuestionCount: number | null;
  durationSeconds: number | null;
  questionTimeLimitSeconds: number | null;
  weakFocusPercent: number;
  recentWindow: number;
  questionList: string[] | null;
  selectedLeftNumbers: number[];
  selectedRightNumbers: number[];
  actualQuestionCount: number;
  totalCorrect: number;
  totalIncorrect: number;
  accuracy: number;
  averageResponseTimeMs: number;
  startedAt: number;
  endedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  attempts: GuestAttempt[];
}

/** Per-question statistics: `ItemStats` with dates as epoch milliseconds, plus the descriptive columns. */
export type GuestStat = Omit<ItemStats, "dueAt" | "lastAttemptedAt"> & {
  questionId: string;
  skill: Skill;
  exerciseType: string;
  concept: string;
  difficulty: string;
  prompt: string;
  dueAt: number | null;
  lastAttemptedAt: number | null;
};

export interface GuestData {
  version: 1;
  /** Signed-in stores only: the account this data belongs to. */
  userId?: number;
  nextId: number;
  /** Oldest first. */
  sessions: GuestSession[];
  stats: Record<string, GuestStat>;
}

export const emptyGuestData = (): GuestData => ({ version: 1, nextId: 1, sessions: [], stats: {} });

/**
 * What is stored is compressed (see `pack.ts` and `src/features/offline/lib/compression.ts`), which keeps a long history
 * far below the storage quota. Data saved before compression existed is plain JSON; it is still read
 * here and is replaced by the compressed form the next time it is saved.
 */
function readStored(stored: string): unknown {
  const segments = decompressSegments(stored);
  return segments ? unpackData(segments) : JSON.parse(stored);
}

export function loadGuestData(key: string = GUEST_STORAGE_KEY): GuestData {
  try {
    const raw: unknown = readStored(localStorage.getItem(key) ?? "null");
    if (raw && typeof raw === "object") {
      const data = raw as Partial<GuestData>;
      if (data.version === 1 && Array.isArray(data.sessions) && data.stats && typeof data.stats === "object" && Number.isInteger(data.nextId)) {
        return data as GuestData;
      }
    }
  } catch {
    // Storage unavailable or corrupt: start empty.
  }
  return emptyGuestData();
}

/** Writes the data back. Returns false when the browser refuses (storage full or blocked, e.g. private mode). */
export function saveGuestData(data: GuestData, key: string = GUEST_STORAGE_KEY): boolean {
  trimSessions(data);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      localStorage.setItem(key, compressSegments(packData(data), key));
      return true;
    } catch {
      // Out of space: shed the older half of the history and try again.
      if (data.sessions.length <= 1) return false;
      data.sessions = shedOlderHalf(data.sessions);
    }
  }
  return false;
}

const isUnsynced = (s: GuestSession) => s.synced === false;

/** Drops the oldest sessions beyond the limit, but never one the server has not received yet (up to a hard cap). */
function trimSessions(data: GuestData): void {
  if (data.sessions.length <= MAX_GUEST_SESSIONS) return;
  let excess = data.sessions.length - MAX_GUEST_SESSIONS;
  const kept: GuestSession[] = [];
  for (const s of data.sessions) {
    if (excess > 0 && !isUnsynced(s)) excess -= 1;
    else kept.push(s);
  }
  data.sessions = kept.length > MAX_UNSYNCED_SESSIONS ? kept.slice(-MAX_UNSYNCED_SESSIONS) : kept;
}

/** Out-of-space fallback: removes the older half of the sessions, keeping unsynced ones where possible. */
function shedOlderHalf(sessions: GuestSession[]): GuestSession[] {
  let drop = Math.floor(sessions.length / 2);
  const kept = sessions.filter((s) => {
    if (drop > 0 && !isUnsynced(s)) {
      drop -= 1;
      return false;
    }
    return true;
  });
  // Nothing synced left to drop: lose the oldest unsynced instead of failing outright.
  return kept.length === sessions.length ? sessions.slice(Math.ceil(sessions.length / 2)) : kept;
}

export function clearGuestData(key: string = GUEST_STORAGE_KEY): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export const findSession = (data: GuestData, id: number): GuestSession | undefined => data.sessions.find((s) => s.id === id);

export const toItemStats = (stat: GuestStat | undefined): ItemStats | null =>
  stat
    ? {
        ...stat,
        dueAt: stat.dueAt === null ? null : new Date(stat.dueAt),
        lastAttemptedAt: stat.lastAttemptedAt === null ? null : new Date(stat.lastAttemptedAt),
      }
    : null;
