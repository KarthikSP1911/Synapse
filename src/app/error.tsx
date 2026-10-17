"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { classifyError } from "@/lib/classify-error";
import { log } from "@/lib/logger";

const COPY = {
  offline: { title: "You're offline", text: "This page needs a connection. Check your network and try again." },
  outdated: { title: "Synapse was updated", text: "This page was opened before an update. Reload it to carry on." },
  failed: { title: "Something went wrong", text: "We couldn't load this page. This is usually a temporary database or network problem." },
} as const;

export default function Error({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  // Starts as "failed" so the server and the first browser render agree, then looks at the connection.
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setOnline(navigator.onLine), 0);
    return () => clearTimeout(timer);
  }, []);

  const kind = classifyError(error, online);
  const copy = COPY[kind];

  useEffect(() => {
    // The server's own entry for a server error has this digest as its reference.
    log.error("The error page was shown", error, { page: typeof location === "undefined" ? undefined : location.pathname, kind }, error.digest);
  }, [error, kind]);

  return (
    <div className="container grid min-h-[60vh] place-items-center py-16">
      <div className="max-w-md space-y-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Error</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-muted-foreground">{copy.text}</p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="flex justify-center gap-2 pt-2">
          {kind === "outdated" ? (
            <Button onClick={() => window.location.reload()}>Reload</Button>
          ) : (
            // `retry` fetches the page again; `reset` would only render the same failed result once more.
            <Button onClick={() => (retry ? retry() : reset())}>Try again</Button>
          )}
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
