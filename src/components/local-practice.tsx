"use client";

import Link from "next/link";
import PracticeSession from "@/components/practice-session";
import GuestSummary from "@/components/guest-summary";
import { Page } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { useSessionIdFromUrl } from "@/components/local-session-id";
import { useLocalStore } from "@/components/viewer-provider";

function Spinner() {
  return (
    <div className="grid min-h-[50dvh] place-items-center" role="status">
      <div className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}

function NotFound() {
  return (
    <Page narrow>
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-lg font-semibold tracking-tight">Session not found</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">This link does not point at a practice session saved on this device.</p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          Start a session
        </Link>
      </div>
    </Page>
  );
}

/** The live practice screen for a session stored on this device (see `src/lib/guest/api.ts`). */
export function LocalPractice() {
  const id = useSessionIdFromUrl();
  const store = useLocalStore();
  if (id === undefined) return <Spinner />;
  if (id === null || !store) return <NotFound />;
  return <PracticeSession sessionId={String(id)} store={store} />;
}

/** The summary of a session stored on this device. */
export function LocalSummary() {
  const id = useSessionIdFromUrl();
  const store = useLocalStore();
  if (id === undefined) return <Spinner />;
  if (id === null || !store) return <NotFound />;
  return <GuestSummary sessionId={id} store={store} />;
}
