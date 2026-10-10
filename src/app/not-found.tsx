import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container grid min-h-[60vh] place-items-center py-16">
      <div className="max-w-md space-y-4 text-center">
        <p className="font-mono text-6xl font-semibold tracking-tighter text-muted-foreground/40">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">That page doesn&apos;t exist or the session was removed.</p>
        <div className="pt-2">
          <Link href="/" className={buttonVariants({})}>
            Back to practice
          </Link>
        </div>
      </div>
    </div>
  );
}
