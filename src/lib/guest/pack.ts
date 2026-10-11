import type { GuestAttempt, GuestData, GuestSession, GuestStat } from "@/lib/guest/storage";
import { questionFromId } from "@/lib/skills/build";
import type { Outcome } from "@/lib/skills/types";

/**
 * A compact form of `GuestData` for storage. The in-memory shape is unchanged; this only decides what is
 * written to localStorage and rebuilds the rest when it is read back.
 *
 * Almost all of the bytes in a practice history are text that repeats: every attempt and every statistics
 * row carries the question's prompt, skill, exercise type, difficulty, concept and correct answer, and all
 * of those can be rebuilt from the question id alone. They are left out (and rebuilt on load) whenever the
 * rebuilt value is identical to the stored one. When it is not, or the id is no longer understood, the
 * whole record is stored as it was, so packing never changes what is read back.
 *
 * Layout, as separate texts so each can be compressed (and cached) on its own, see `src/lib/compression.ts`:
 *   [header, ...statistics shards, ...sessions]
 */

const PACK_VERSION = 2;
/** Statistics rows are spread over this many texts by question id, so one answer changes only a small part. */
const STAT_SHARDS = 16;

/** Stored by position: only ever append to this list. */
const OUTCOME_CODES: readonly Outcome[] = ["correct", "incorrect", "skipped", "timed_out"];

/** Numeric statistics columns in stored order. Only ever append, so older stored data keeps its meaning. */
const STAT_NUMBERS = [
  "totalAttempts",
  "correctAttempts",
  "incorrectAttempts",
  "hintedAttempts",
  "accuracy",
  "averageResponseTimeMs",
  "fastestResponseTimeMs",
  "slowestResponseTimeMs",
  "currentCorrectStreak",
  "currentIncorrectStreak",
  "bestCorrectStreak",
  "weaknessScore",
  "box",
  "dueAt",
  "lastAttemptedAt",
] as const satisfies readonly (keyof GuestStat)[];

// Compile-time guards: a field added to `GuestAttempt` or `GuestStat` fails the build here until it is
// handled above, instead of being silently dropped from storage.
type Assert<T extends true> = T;
type Covered<Missing> = [Missing] extends [never] ? true : false;
type AttemptStored = "questionId" | "userAnswerText" | "outcome" | "hinted" | "responseTimeMs" | "at";
type AttemptRebuilt = "skill" | "exerciseType" | "difficulty" | "prompt" | "correctAnswerText" | "isCorrect";
type StatRebuilt = "questionId" | "skill" | "exerciseType" | "concept" | "difficulty" | "prompt";
export type AttemptFieldsCovered = Assert<Covered<Exclude<keyof GuestAttempt, AttemptStored | AttemptRebuilt>>>;
export type StatFieldsCovered = Assert<Covered<Exclude<keyof GuestStat, StatRebuilt | (typeof STAT_NUMBERS)[number]>>>;

type PackedAttempt =
  | [questionId: string, answer: string | null, outcome: number, hinted: 0 | 1, responseTimeMs: number, msAfterPrevious: number]
  | GuestAttempt;
type PackedStat = [questionId: string, ...numbers: (number | null)[]] | { key: string; stat: GuestStat };
type PackedSession = [session: Omit<GuestSession, "attempts">, attempts: PackedAttempt[]];

interface Header {
  v: number;
  userId?: number;
  nextId: number;
  shards: number;
}

/** What a question id says about the question, looked up once per id per call. */
interface Described {
  skill: GuestAttempt["skill"];
  exerciseType: string;
  difficulty: string;
  prompt: string;
  concept: string;
  answerText: string;
}

type Describe = (questionId: string) => Described | null;

function describer(): Describe {
  const known = new Map<string, Described | null>();
  return (id) => {
    let found = known.get(id);
    if (found === undefined) {
      const q = questionFromId(id);
      found = q && { skill: q.skill, exerciseType: q.exerciseType, difficulty: q.difficulty, prompt: q.prompt, concept: q.concept, answerText: q.answerText };
      known.set(id, found);
    }
    return found;
  };
}

/** FNV-1a: any stable spread will do, it only has to give the same shard for the same id every time. */
function shardOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % STAT_SHARDS;
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

function packAttempt(a: GuestAttempt, previousAt: number, describe: Describe): PackedAttempt {
  const d = describe(a.questionId);
  const code = OUTCOME_CODES.indexOf(a.outcome);
  const rebuildable =
    d !== null &&
    code >= 0 &&
    a.skill === d.skill &&
    a.exerciseType === d.exerciseType &&
    a.difficulty === d.difficulty &&
    a.prompt === d.prompt &&
    a.correctAnswerText === d.answerText &&
    a.isCorrect === (a.outcome === "correct");
  return rebuildable ? [a.questionId, a.userAnswerText, code, a.hinted ? 1 : 0, a.responseTimeMs, a.at - previousAt] : a;
}

function packSession(session: GuestSession, describe: Describe): PackedSession {
  const { attempts, ...rest } = session;
  // Times are stored as the gap since the previous answer, which is a few digits instead of thirteen.
  let previousAt = session.startedAt;
  const packed = attempts.map((a) => {
    const p = packAttempt(a, previousAt, describe);
    previousAt = a.at;
    return p;
  });
  return [rest, packed];
}

function packStat(key: string, stat: GuestStat, describe: Describe): PackedStat {
  const d = describe(key);
  const rebuildable =
    d !== null &&
    stat.questionId === key &&
    stat.skill === d.skill &&
    stat.exerciseType === d.exerciseType &&
    stat.concept === d.concept &&
    stat.difficulty === d.difficulty &&
    stat.prompt === d.prompt;
  return rebuildable ? [key, ...STAT_NUMBERS.map((field) => stat[field])] : { key, stat };
}

/** The texts to store for the data: a header, the statistics shards, then one text per session. */
export function packData(data: GuestData): string[] {
  const describe = describer();
  const shards: PackedStat[][] = Array.from({ length: STAT_SHARDS }, () => []);
  for (const [key, stat] of Object.entries(data.stats)) shards[shardOf(key)].push(packStat(key, stat, describe));

  const header: Header = { v: PACK_VERSION, ...(data.userId === undefined ? {} : { userId: data.userId }), nextId: data.nextId, shards: STAT_SHARDS };
  return [JSON.stringify(header), ...shards.map((s) => JSON.stringify(s)), ...data.sessions.map((s) => JSON.stringify(packSession(s, describe)))];
}

// ---------------------------------------------------------------------------
// Unpacking
// ---------------------------------------------------------------------------

function unpackAttempt(p: PackedAttempt, previousAt: number, describe: Describe): GuestAttempt | null {
  if (!Array.isArray(p)) return p;
  const [questionId, userAnswerText, code, hinted, responseTimeMs, gap] = p;
  const d = describe(questionId);
  const outcome = OUTCOME_CODES[code];
  // An id this version no longer understands cannot be asked, reviewed or uploaded, so there is nothing to keep.
  if (!d || !outcome) return null;
  return {
    questionId,
    skill: d.skill,
    exerciseType: d.exerciseType,
    difficulty: d.difficulty,
    prompt: d.prompt,
    correctAnswerText: d.answerText,
    userAnswerText,
    isCorrect: outcome === "correct",
    outcome,
    hinted: hinted === 1,
    responseTimeMs,
    at: previousAt + gap,
  };
}

function unpackSession(packed: PackedSession, describe: Describe): GuestSession {
  const [rest, attempts] = packed;
  let previousAt = rest.startedAt;
  const out: GuestAttempt[] = [];
  for (const p of attempts) {
    const attempt = unpackAttempt(p, previousAt, describe);
    // The clock moves on even for an attempt that is dropped, or every later time would shift.
    previousAt = Array.isArray(p) ? previousAt + p[5] : p.at;
    if (attempt) out.push(attempt);
  }
  return { ...rest, attempts: out };
}

function unpackStat(p: PackedStat, describe: Describe): { key: string; stat: GuestStat } | null {
  if (!Array.isArray(p)) return p;
  const [key, ...numbers] = p;
  const d = describe(key);
  if (!d) return null;
  const stat = { questionId: key, skill: d.skill, exerciseType: d.exerciseType, concept: d.concept, difficulty: d.difficulty, prompt: d.prompt } as GuestStat;
  STAT_NUMBERS.forEach((field, i) => {
    (stat as unknown as Record<string, number | null>)[field] = numbers[i] ?? null;
  });
  return { key, stat };
}

/** The data `packData` was made from, or null when the texts are not in this layout (or are damaged). */
export function unpackData(texts: readonly string[]): GuestData | null {
  try {
    const [headerText, ...rest] = texts;
    const header = JSON.parse(headerText) as Header;
    if (header?.v !== PACK_VERSION || !Number.isInteger(header.nextId) || !Number.isInteger(header.shards) || header.shards < 0 || rest.length < header.shards) {
      return null;
    }
    const describe = describer();
    const stats: Record<string, GuestStat> = {};
    for (const text of rest.slice(0, header.shards)) {
      for (const p of JSON.parse(text) as PackedStat[]) {
        const entry = unpackStat(p, describe);
        if (entry) stats[entry.key] = entry.stat;
      }
    }
    const sessions = rest.slice(header.shards).map((text) => unpackSession(JSON.parse(text) as PackedSession, describe));
    return { version: 1, ...(header.userId === undefined ? {} : { userId: header.userId }), nextId: header.nextId, sessions, stats };
  } catch {
    return null;
  }
}
