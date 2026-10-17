/**
 * What a profile holds and the rules for it. Pure and free of server imports, so the sign-up form, the edit form,
 * the server actions and the tests all share one definition.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 160;
export const LOCATION_MAX = 60;

/** Letters, digits and underscores, starting with a letter. Stored lower-cased so the unique index is case-insensitive. */
const USERNAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Names that would read as the site speaking, or collide with routes. */
const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "support", "synapse", "moderator", "system", "staff", "guest", "null", "undefined"]);

/** The stored form of a typed username, or null when it is not a valid one. */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return username.length >= USERNAME_MIN && username.length <= USERNAME_MAX && USERNAME_PATTERN.test(username) && !RESERVED_USERNAMES.has(username)
    ? username
    : null;
}

/** What to tell the person when a typed username is not acceptable, or null when it is. */
export function usernameProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length < USERNAME_MIN) return `Choose a username of at least ${USERNAME_MIN} characters.`;
  const username = value.trim().toLowerCase();
  if (username.length > USERNAME_MAX) return `Usernames can be at most ${USERNAME_MAX} characters.`;
  if (!/^[a-z]/.test(username)) return "A username must start with a letter.";
  if (!USERNAME_PATTERN.test(username)) return "Use only letters, numbers and underscores in your username.";
  if (RESERVED_USERNAMES.has(username)) return "That username is not available. Please choose another.";
  return null;
}

/** Collapses runs of whitespace and trims, for single-line fields. */
export const cleanLine = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Trims a multi-line field and caps its length, keeping line breaks but not runs of blank lines. */
export const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

export const GOALS = [
  { id: "speed", label: "Get faster at mental maths" },
  { id: "school", label: "Keep up with school maths" },
  { id: "exam", label: "Prepare for an exam" },
  { id: "interview", label: "Prepare for interviews" },
  { id: "brain", label: "Train my brain for fun" },
] as const;

export type GoalId = (typeof GOALS)[number]["id"];

export const LEVELS = [
  { id: "beginner", label: "Just starting out" },
  { id: "intermediate", label: "Comfortable with the basics" },
  { id: "advanced", label: "Confident and fast" },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];

/** A stored goal or level id that is still on the list, else null (an old or tampered value shows as unset). */
export const parseGoal = (value: unknown): GoalId | null => GOALS.find((g) => g.id === value)?.id ?? null;
export const parseLevel = (value: unknown): LevelId | null => LEVELS.find((l) => l.id === value)?.id ?? null;

/** The avatar ids, in the order the picker shows them. The icon and colours for each live in `avatar.tsx`. */
export const AVATAR_IDS = [
  "brain", "atom", "pi", "sigma", "infinity", "calculator",
  "rocket", "zap", "flame", "crown", "trophy", "gem",
  "cat", "dog", "rabbit", "panda", "squirrel", "turtle",
  "bird", "fish", "ghost", "bot", "moon", "sun",
  "leaf", "mountain", "compass", "telescope", "puzzle", "orbit",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const DEFAULT_AVATAR: AvatarId = "brain";

export const parseAvatar = (value: unknown): AvatarId => AVATAR_IDS.find((a) => a === value) ?? DEFAULT_AVATAR;
