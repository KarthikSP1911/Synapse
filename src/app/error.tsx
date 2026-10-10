"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container grid min-h-[60vh] place-items-center py-16">
      <div className="max-w-md space-y-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Error</p>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground">
          We couldn&apos;t load this page. This is usually a temporary database or network problem.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
