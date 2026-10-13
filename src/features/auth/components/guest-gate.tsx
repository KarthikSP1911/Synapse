import Link from "next/link";
import { Lock } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";

/** Shown to guests in place of pages that need an account (they depend on server-side history or identity). */
export function GuestGate({ title, description }: { title: string; description: string }) {
  return (
    <Page narrow>
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title} needs an account</h1>
        <p className="mx-auto mt-1 max-w-md text-balance text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/signup" className={buttonVariants({})}>
            Create an account
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>
            Log in
          </Link>
          <Link href="/" className={buttonVariants({ variant: "ghost" })}>
            Keep practising
          </Link>
        </div>
        <p className="mx-auto mt-5 max-w-md text-xs text-muted-foreground">
          Guest practice is saved in this browser only and is not carried over to a new account.
        </p>
      </div>
    </Page>
  );
}
