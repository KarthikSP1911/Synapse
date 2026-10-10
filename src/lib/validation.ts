export const MIN_OPERAND = 1;
export const MAX_OPERAND = 20;
export const MAX_RESPONSE_TIME_MS = 10 * 60 * 1000;
export const ALLOWED_QUESTION_COUNTS = [10, 20, 30, 50, 100] as const;
export const ALLOWED_DURATIONS = [30, 60, 120] as const;
/** Per-question time limits in seconds; 0 turns the limit off. */
export const ALLOWED_QUESTION_TIME_LIMITS = [0, 10, 20, 30] as const;
export const MAX_WEAK_FOCUS_PERCENT = 50;
export const MAX_RECENT_WINDOW = 10;
export const DEFAULT_WEAK_FOCUS_PERCENT = 30;
export const DEFAULT_RECENT_WINDOW = 5;
/** Extra time allowed for the last answer of a timed session to arrive. */
export const TIMED_GRACE_MS = 2000;
/** Slack when checking that a "timed out" report really exceeded the per-question limit. */
export const QUESTION_LIMIT_SLACK_MS = 1500;

export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

export interface TimedSession {
  mode: string;
  durationSeconds: number | null;
  startedAt: Date;
  pausedAt?: Date | null;
  pausedMs?: number;
}

/** When a timed session's clock runs out: its length pushed back by every pause. */
export function sessionDeadline(session: TimedSession): Date | null {
  if (session.mode !== "timed" || session.durationSeconds === null) return null;
  return new Date(session.startedAt.getTime() + session.durationSeconds * 1000 + (session.pausedMs ?? 0));
}

/** A paused session's clock is stopped, so it cannot time out while paused. */
export function isTimedOut(session: TimedSession, graceMs = 0, now = Date.now()) {
  const deadline = sessionDeadline(session);
  return deadline !== null && !session.pausedAt && now > deadline.getTime() + graceMs;
}

export function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isOperand(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_OPERAND && (value as number) <= MAX_OPERAND;
}

export function isOperandList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_OPERAND && value.every(isOperand);
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
