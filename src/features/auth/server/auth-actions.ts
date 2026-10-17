"use server";

import { redirect } from "next/navigation";
import { endSession, normalizeEmail, passwordProblem, registerUser, safeNextPath, startGuest, startSession, verifyLogin } from "@/features/auth/server/auth";
import { log } from "@/lib/logger";
import { normalizeUsername, usernameProblem } from "@/features/profile/lib/profile";

export interface AuthFormState {
  error?: string;
  /** Echoed back so a failed submit does not clear the email field. */
  email?: string;
  /** Same for the username on the sign-up form. */
  username?: string;
}

/**
 * A failure inside an action that is not the person's mistake (the database could not be reached, a cookie could not
 * be set). It is logged with a reference and shown on the form with that reference, instead of throwing to the error
 * page, so they can try again straight away and, if it keeps happening, quote the reference. Never wrap `redirect()`
 * in this: it works by throwing.
 */
function failed(action: "login" | "signup", error: unknown, email: string, username?: string): AuthFormState {
  const reference = log.error(`The ${action} action failed`, error, { action });
  return { error: `We couldn't reach the server just now. Please try again in a moment. (Reference ${reference})`, email, username };
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function loginAction(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(text(form, "email"));
  const password = text(form, "password");
  const typed = text(form, "email");
  if (!email || !password || password.length > 128) return { error: "Enter your email and password.", email: typed };

  let userId: number;
  try {
    const result = await verifyLogin(email, password, text(form, "timezone"));
    if (!result.ok) {
      log.warn("Login refused", { reason: result.error });
      return { error: result.error, email: typed };
    }
    userId = result.userId;
    await startSession(userId, form.get("remember") === "on");
  } catch (error) {
    return failed("login", error, typed);
  }
  log.info("Signed in", { userId });
  redirect(safeNextPath(text(form, "next")));
}

export async function signupAction(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const typed = text(form, "email");
  const typedUsername = text(form, "username");
  const email = normalizeEmail(typed);
  const username = normalizeUsername(typedUsername);
  const password = text(form, "password");
  if (!email) return { error: "Enter a valid email address.", email: typed, username: typedUsername };
  if (!username) return { error: usernameProblem(typedUsername) ?? "Choose a different username.", email: typed, username: typedUsername };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, email: typed, username: typedUsername };
  if (password !== text(form, "confirm")) return { error: "The two passwords do not match.", email: typed, username: typedUsername };

  let userId: number;
  try {
    const result = await registerUser(email, password, text(form, "timezone"), username);
    if (!result.ok) {
      log.warn("Sign-up refused", { reason: result.error });
      return { error: result.error, email: typed, username: typedUsername };
    }
    userId = result.userId;
    await startSession(userId, form.get("remember") === "on");
  } catch (error) {
    return failed("signup", error, typed, typedUsername);
  }
  log.info("Account created", { userId });
  // New accounts finish setting up their profile (photo, name, goal) before anything else.
  redirect("/profile/edit?welcome=1");
}

export async function guestAction(): Promise<void> {
  await startGuest();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
