import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, practiceSessions, questionAttempts, questionStats, users } from "@/db/schema";
import { isValidTimeZone } from "@/lib/activity";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, decoyHash, hashPassword, verifyPassword } from "@/lib/password";

/**
 * Email + password accounts with database-backed sessions.
 *
 * The cookie holds a random token; the database stores only its SHA-256 hash. Logging out or
 * deleting the row ends the session immediately, which a signed stateless cookie could not do.
 */

/** "Remember me" keeps the login for 12 months. */
export const REMEMBER_MS = 365 * 24 * 60 * 60 * 1000;
/** Without it the cookie dies with the browser, and the session row expires after a day regardless. */
export const SHORT_SESSION_MS = 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: number;
  email: string;
  timezone: string;
  createdAt: Date;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function passwordProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  if (value.length > MAX_PASSWORD_LENGTH) return `Passwords can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

/** Only same-site paths are accepted as a post-login destination, so the login form cannot redirect off-site. */
export function safeNextPath(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) && !value.startsWith("/login") && !value.startsWith("/signup") ? value : "/";
}

const isUniqueViolation = (error: unknown): boolean => {
  for (let e = error as { code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === "23505") return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Signs the user in on this browser: stores the session and sets the cookie. */
export async function startSession(userId: number, remember: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const lifetime = remember ? REMEMBER_MS : SHORT_SESSION_MS;
  const expiresAt = new Date(Date.now() + lifetime);

  await db.insert(authSessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  // Housekeeping: drop this user's dead sessions so the table does not grow without bound.
  await db.delete(authSessions).where(and(eq(authSessions.userId, userId), lt(authSessions.expiresAt, new Date())));

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge for a plain login: the cookie is a browser-session cookie.
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request, so layouts and pages can both ask. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;

  const [row] = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone, createdAt: users.createdAt })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

/** The 401 response API routes return when nobody is signed in. */
export const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });

/** For pages and server components: signed-out visitors are sent to the login page. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ---------------------------------------------------------------------------
// Sign up and log in
// ---------------------------------------------------------------------------

export type AuthResult = { ok: true; userId: number } | { ok: false; error: string };

const zoneOrUtc = (zone: unknown) => (isValidTimeZone(zone) ? zone : "UTC");

/**
 * Creates an account. The very first account also claims all practice data recorded before
 * accounts existed (rows with no owner), so nothing already practised is lost.
 */
export async function registerUser(email: string, password: string, timezone: unknown): Promise<AuthResult> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, error: "An account with this email already exists. Try logging in instead." };

  let userId: number;
  try {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password), timezone: zoneOrUtc(timezone) })
      .returning({ id: users.id });
    userId = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "An account with this email already exists. Try logging in instead." };
    throw error;
  }

  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total === 1) {
    // One batch = one transaction: either all legacy rows are claimed or none are.
    await db.batch([
      db.update(practiceSessions).set({ userId }).where(isNull(practiceSessions.userId)),
      db.update(questionAttempts).set({ userId }).where(isNull(questionAttempts.userId)),
      db.update(questionStats).set({ userId }).where(isNull(questionStats.userId)),
    ]);
  }
  return { ok: true, userId };
}

const BAD_LOGIN = "Incorrect email or password.";

export async function verifyLogin(email: string, password: string, timezone: unknown): Promise<AuthResult> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Hash against a decoy when the email is unknown, so response time does not reveal which emails exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await decoyHash()));
  if (!user || !valid) return { ok: false, error: BAD_LOGIN };

  const zone = zoneOrUtc(timezone);
  if (zone !== user.timezone && isValidTimeZone(timezone)) {
    await db.update(users).set({ timezone: zone }).where(eq(users.id, user.id));
  }
  return { ok: true, userId: user.id };
}
