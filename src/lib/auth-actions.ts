"use server";

import { redirect } from "next/navigation";
import { endSession, normalizeEmail, passwordProblem, registerUser, safeNextPath, startSession, verifyLogin } from "@/lib/auth";

export interface AuthFormState {
  error?: string;
  /** Echoed back so a failed submit does not clear the email field. */
  email?: string;
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

  const result = await verifyLogin(email, password, text(form, "timezone"));
  if (!result.ok) return { error: result.error, email: typed };

  await startSession(result.userId, form.get("remember") === "on");
  redirect(safeNextPath(text(form, "next")));
}

export async function signupAction(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const typed = text(form, "email");
  const email = normalizeEmail(typed);
  const password = text(form, "password");
  if (!email) return { error: "Enter a valid email address.", email: typed };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, email: typed };
  if (password !== text(form, "confirm")) return { error: "The two passwords do not match.", email: typed };

  const result = await registerUser(email, password, text(form, "timezone"));
  if (!result.ok) return { error: result.error, email: typed };

  await startSession(result.userId, form.get("remember") === "on");
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
