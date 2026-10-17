"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guestAction, loginAction, signupAction, type AuthFormState } from "@/features/auth/server/auth-actions";

const initial: AuthFormState = {};

const subscribeNever = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "UTC";

/**
 * One form for both screens; signing up adds a password confirmation. The server action is passed
 * to the form directly, so the form still posts correctly (never as a GET with the password in the
 * URL) if it is submitted before JavaScript has loaded.
 *
 * Sized to fit one screen (see `AuthShell`): spacing tightens on short screens, and on a short landscape
 * screen the form becomes two columns so the password and confirmation fields share a row.
 */
export default function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState(signup ? signupAction : loginAction, initial);
  // The browser knows the user's time zone; the server uses it to decide which day an attempt counts toward.
  const timezone = useSyncExternalStore(subscribeNever, browserTimeZone, serverTimeZone);

  return (
    <form
      action={action}
      className="grid gap-x-3 gap-y-4 [@media(max-height:40rem)]:gap-y-3 [@media(max-height:32rem)_and_(min-width:40rem)]:grid-cols-2 [@media(max-height:32rem)_and_(min-width:40rem)]:gap-y-2"
      noValidate
    >
      <input type="hidden" name="timezone" value={timezone} />
      {next && <input type="hidden" name="next" value={next} />}

      <div className="col-span-full space-y-1.5 [@media(max-height:32rem)_and_(min-width:40rem)]:col-span-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} className="h-10 [@media(max-height:40rem)]:h-9 [@media(max-height:32rem)_and_(min-width:40rem)]:h-[2.125rem]" />
      </div>

      <div className="col-span-full space-y-1.5 [@media(max-height:32rem)_and_(min-width:40rem)]:col-span-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">Password</Label>
          {signup && <span className="text-xs text-muted-foreground [@media(max-height:32rem)_and_(min-width:40rem)]:hidden">At least 8 characters</span>}
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={signup ? 8 : undefined}
          className="h-10 [@media(max-height:40rem)]:h-9 [@media(max-height:32rem)_and_(min-width:40rem)]:h-[2.125rem]"
        />
      </div>

      {signup && (
        <div className="col-span-full space-y-1.5 [@media(max-height:32rem)_and_(min-width:40rem)]:col-span-1">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-10 [@media(max-height:40rem)]:h-9 [@media(max-height:32rem)_and_(min-width:40rem)]:h-[2.125rem]" />
        </div>
      )}

      <Label
        htmlFor="remember"
        className={signup ? "col-span-full cursor-pointer gap-2.5 font-normal [@media(max-height:32rem)_and_(min-width:40rem)]:col-span-1 [@media(max-height:32rem)_and_(min-width:40rem)]:self-end [@media(max-height:32rem)_and_(min-width:40rem)]:pb-2.5" : "col-span-full cursor-pointer gap-2.5 font-normal"}
      >
        <input id="remember" name="remember" type="checkbox" defaultChecked className="size-4 rounded-[4px] accent-primary" />
        Remember me for 12 months
      </Label>

      {state.error && (
        <p role="alert" className="col-span-full rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="col-span-full w-full" disabled={pending}>
        {pending ? (signup ? "Creating account…" : "Logging in…") : signup ? "Create account" : "Log in"}
      </Button>

      {/* A second submit button with its own action: it skips the account fields entirely (the form is noValidate). */}
      <Button type="submit" formAction={guestAction} variant="outline" className="col-span-full w-full" disabled={pending}>
        Try without an account
      </Button>

      <p className="col-span-full text-center text-sm text-muted-foreground">
        {signup ? "Already have an account? " : "New to Synapse? "}
        <Link
          href={signup ? "/login" : "/signup"}
          className="rounded-sm text-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {signup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
