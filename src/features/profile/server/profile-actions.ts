"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isUsernameTaken, requireUser } from "@/features/auth/server/auth";
import {
  BIO_MAX, DISPLAY_NAME_MAX, LOCATION_MAX, cleanLine, cleanText, normalizeUsername, parseAvatar, parseGoal, parseLevel, usernameProblem,
} from "@/features/profile/lib/profile";
import { log } from "@/lib/logger";

/** What the form shows again after a failed save, so nothing the person typed is lost. */
export interface ProfileFormValues {
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  location: string;
  goal: string;
  level: string;
}

export interface ProfileFormState {
  error?: string;
  values?: ProfileFormValues;
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function updateProfileAction(_previous: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const user = await requireUser();
  const welcome = form.get("welcome") === "1";

  const values: ProfileFormValues = {
    username: text(form, "username"),
    displayName: text(form, "displayName"),
    avatar: text(form, "avatar"),
    bio: text(form, "bio"),
    location: text(form, "location"),
    goal: text(form, "goal"),
    level: text(form, "level"),
  };

  const username = normalizeUsername(values.username);
  if (!username) return { error: usernameProblem(values.username) ?? "Choose a different username.", values };

  try {
    if (username !== user.username && (await isUsernameTaken(username, user.id))) {
      return { error: "That username is already taken. Please choose another.", values };
    }
    await db
      .update(users)
      .set({
        username,
        displayName: cleanLine(values.displayName, DISPLAY_NAME_MAX) || null,
        avatar: parseAvatar(values.avatar),
        bio: cleanText(values.bio, BIO_MAX) || null,
        location: cleanLine(values.location, LOCATION_MAX) || null,
        goal: parseGoal(values.goal),
        level: parseLevel(values.level),
      })
      .where(eq(users.id, user.id));
  } catch (error) {
    // Losing a race for a username is the one failure that is the person's to fix; anything else is ours.
    for (let e = error as { code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
      if (e.code === "23505") return { error: "That username is already taken. Please choose another.", values };
    }
    const reference = log.error("The profile update failed", error, { userId: user.id });
    return { error: `We couldn't save your profile just now. Please try again in a moment. (Reference ${reference})`, values };
  }

  log.info("Profile updated", { userId: user.id });
  // The header shows the avatar on every page, so every page must re-render with the new one.
  revalidatePath("/", "layout");
  redirect(welcome ? "/" : "/profile");
}
