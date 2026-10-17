import { log } from "@/lib/logger";
import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, practiceSessions, questionAttempts, questionStats, users } from "@/db/schema";
import { isValidTimeZone } from "@/features/progress/lib/activity";
import { GUEST_COOKIE, SESSION_COOKIE } from "@/features/auth/lib/auth-constants";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, decoyHash, hashPassword, verifyPassword } from "@/features/auth/lib/password";

/**
 * Email + password accounts with database-backed sessions.
 *
 * The cookie holds a random token; the database stores only its SHA-256 hash. Logging out or
 * deleting the row ends the session immediately, which a signed stateless cookie could not do.
 */

/** "Remember me" keeps the login for 12 months. */
const REMEMBER_MS = 365 * 24 * 60 * 60 * 1000;
/** Without it the cookie dies with the browser, and the session row expires after a day regardless. */
const SHORT_SESSION_MS = 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: number;
  email: string;
  timezone: string;
  createdAt: Date;
  /** Null only for accounts that predate usernames. */
  username: string | null;
  displayName: string | null;
  avatar: string;
  bio: string | null;
  location: string | null;
  goal: string | null;
  level: string | null;
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

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge for a plain login: the cookie is a browser-session cookie.
    ...(remember ? { expires: expiresAt } : {}),
  });
  // An account replaces guest mode. The guest's browser-only progress is not carried over.
  store.delete(GUEST_COOKIE);
}

/** Lets this browser use the app as a guest, with progress kept in the browser only. */
export async function startGuest(): Promise<void> {
  (await cookies()).set(GUEST_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + REMEMBER_MS),
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
    .select({
      id: users.id,
      email: users.email,
      timezone: users.timezone,
      createdAt: users.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatar: users.avatar,
      bio: users.bio,
      location: users.location,
      goal: users.goal,
      level: users.level,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
});

/** Who is looking at a page: a signed-in user, a guest, or nobody (who belongs on the login screen). */
type Viewer = { kind: "user"; user: AuthUser } | { kind: "guest" };

export async function getViewer(): Promise<Viewer | null> {
  const user = await getCurrentUser();
  if (user) return { kind: "user", user };
  return (await cookies()).get(GUEST_COOKIE)?.value === "1" ? { kind: "guest" } : null;
}

/** For pages that also work for guests: anyone else is sent to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

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

type AuthResult = { ok: true; userId: number } | { ok: false; error: string };

const zoneOrUtc = (zone: unknown) => (isValidTimeZone(zone) ? zone : "UTC");

const EMAIL_TAKEN = "An account with this email already exists. Try logging in instead.";
const USERNAME_TAKEN = "That username is already taken. Please choose another.";

/** Whether a username (already normalised) belongs to any account other than `exceptUserId`. */
export async function isUsernameTaken(username: string, exceptUserId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(exceptUserId === undefined ? eq(users.username, username) : and(eq(users.username, username), ne(users.id, exceptUserId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Creates an account. The very first account also claims all practice data recorded before
 * accounts existed (rows with no owner), so nothing already practised is lost.
 * `username` is already normalised (lower-case, validated). The rest of the profile is filled in afterwards, on the edit-profile page.
 */
export async function registerUser(email: string, password: string, timezone: unknown, username: string): Promise<AuthResult> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, error: EMAIL_TAKEN };
  if (await isUsernameTaken(username)) return { ok: false, error: USERNAME_TAKEN };

  let userId: number;
  try {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password), timezone: zoneOrUtc(timezone), username })
      .returning({ id: users.id });
    userId = created.id;
  } catch (error) {
    // Two people can pass the checks above at the same moment; the unique indexes decide, and this says which one lost.
    if (isUniqueViolation(error)) return { ok: false, error: (await isUsernameTaken(username)) ? USERNAME_TAKEN : EMAIL_TAKEN };
    throw error;
  }

  try {
    const [{ total }] = await db.select({ total: count() }).from(users);
    if (total === 1) {
      // One batch = one transaction: either all legacy rows are claimed or none are.
      await db.batch([
        db.update(practiceSessions).set({ userId }).where(isNull(practiceSessions.userId)),
        db.update(questionAttempts).set({ userId }).where(isNull(questionAttempts.userId)),
        db.update(questionStats).set({ userId }).where(isNull(questionStats.userId)),
      ]);
    }
  } catch (error) {
    // The account exists, so signing up succeeded; claiming old data is a bonus that can be done another time.
    log.error("Could not hand the earlier practice data to the first account", error, { userId });
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
    // Keeping the time zone current is a nicety: a failure to save it must not stop someone logging in.
    await db
      .update(users)
      .set({ timezone: zone })
      .where(eq(users.id, user.id))
      .catch((error) => log.warn("Could not update the time zone at login", { userId: user.id }, error));
  }
  return { ok: true, userId: user.id };
}
