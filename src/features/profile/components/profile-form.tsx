"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, avatarLabel } from "@/features/profile/components/avatar";
import { AVATAR_IDS, BIO_MAX, DISPLAY_NAME_MAX, GOALS, LEVELS, LOCATION_MAX, USERNAME_MAX, USERNAME_MIN } from "@/features/profile/lib/profile";
import { updateProfileAction, type ProfileFormState, type ProfileFormValues } from "@/features/profile/server/profile-actions";
import { cn } from "@/lib/utils";

const initial: ProfileFormState = {};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/**
 * Edit profile: a picture picked from a grid of icons, then the username and the optional details. `welcome` is the
 * first visit straight after sign-up, which changes the wording and where Save and Skip lead.
 */
export function ProfileForm({ initialValues, welcome }: { initialValues: ProfileFormValues; welcome: boolean }) {
  const [state, action, pending] = useActionState(updateProfileAction, initial);
  // After a failed save the server sends back what was typed; until then the saved values are shown.
  const values = state.values ?? initialValues;
  const [avatar, setAvatar] = useState(values.avatar);
  const [bioLength, setBioLength] = useState(values.bio.length);

  return (
    <form action={action} className="space-y-8" noValidate>
      {welcome && <input type="hidden" name="welcome" value="1" />}
      <input type="hidden" name="avatar" value={avatar} />

      <fieldset className="space-y-3">
        <legend className="flex items-center gap-4">
          <Avatar id={avatar} className="size-16" />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">Profile picture</span>
            <span className="block text-sm text-muted-foreground">{avatarLabel(avatar)}. Pick any icon below.</span>
          </span>
        </legend>
        <div role="radiogroup" aria-label="Profile picture" className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-10">
          {AVATAR_IDS.map((id) => {
            const selected = id === avatar;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={avatarLabel(id)}
                title={avatarLabel(id)}
                onClick={() => setAvatar(id)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-full p-1 outline-none transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95",
                  selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-105"
                )}
              >
                <Avatar id={id} className="size-full" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            minLength={USERNAME_MIN}
            maxLength={USERNAME_MAX}
            defaultValue={values.username}
          />
          <p className="text-xs text-muted-foreground">
            {USERNAME_MIN}–{USERNAME_MAX} characters: letters, numbers and underscores, starting with a letter.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" autoComplete="name" maxLength={DISPLAY_NAME_MAX} defaultValue={values.displayName} placeholder="Optional" />
          <p className="text-xs text-muted-foreground">Shown on your profile instead of your email.</p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="bio">About you</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {bioLength}/{BIO_MAX}
            </span>
          </div>
          <textarea
            id="bio"
            name="bio"
            rows={3}
            maxLength={BIO_MAX}
            defaultValue={values.bio}
            onChange={(event) => setBioLength(event.target.value.length)}
            placeholder="A line or two about you. Optional."
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" autoComplete="address-level2" maxLength={LOCATION_MAX} defaultValue={values.location} placeholder="City or country (optional)" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="level">Where are you starting from?</Label>
          <select id="level" name="level" defaultValue={values.level} className={selectClass}>
            <option value="">Prefer not to say</option>
            {LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="goal">What are you practising for?</Label>
          <select id="goal" name="goal" defaultValue={values.goal} className={selectClass}>
            <option value="">Prefer not to say</option>
            {GOALS.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : welcome ? "Save and start" : "Save profile"}
        </Button>
        <Link href={welcome ? "/" : "/profile"} className={buttonVariants({ variant: "outline", size: "lg" })}>
          {welcome ? "Skip for now" : "Cancel"}
        </Link>
      </div>
    </form>
  );
}
