"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, signupAction, type AuthFormState } from "@/lib/auth-actions";

const initial: AuthFormState = {};

const subscribeNever = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "UTC";

/**
 * One form for both screens; signing up adds a password confirmation. The server action is passed
 * to the form directly, so the form still posts correctly (never as a GET with the password in the
 * URL) if it is submitted before JavaScript has loaded.
 */
export default function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState(signup ? signupAction : loginAction, initial);
  // The browser knows the user's time zone; the server uses it to decide which day an attempt counts toward.
  const timezone = useSyncExternalStore(subscribeNever, browserTimeZone, serverTimeZone);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="timezone" value={timezone} />
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} className="h-10" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={signup ? 8 : undefined}
          className="h-10"
        />
        {signup && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
      </div>

      {signup && (
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-10" />
        </div>
      )}

      <Label htmlFor="remember" className="cursor-pointer gap-2.5 font-normal">
        <input id="remember" name="remember" type="checkbox" defaultChecked className="size-4 rounded-[4px] accent-primary" />
        Remember me for 12 months
      </Label>

      {state.error && (
        <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (signup ? "Creating account…" : "Logging in…") : signup ? "Create account" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {signup ? "Already have an account? " : "New to Mathz? "}
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
