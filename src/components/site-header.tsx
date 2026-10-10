"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/logo-mark";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/", label: "Practice" },
  { href: "/progress", label: "Progress" },
  { href: "/tables", label: "Tables" },
  { href: "/settings", label: "Settings" },
] as const;

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="Mathz home">
      <LogoMark className="size-7" />
      <span className="text-[15px] font-semibold tracking-tight">Mathz</span>
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  // The live practice screen is a focus view: no navigation to distract from the question.
  if (/^\/practice\/\d+$/.test(pathname)) return null;

  // Signed-out visitors only see the login and sign-up screens, so there is nothing to navigate to.
  const showNav = signedIn;
  const profileActive = pathname.startsWith("/profile");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-3">
          {showNav && (
            <nav aria-label="Main" className="no-scrollbar -mr-1 flex h-14 items-stretch overflow-x-auto sm:mr-0">
              {links.map(({ href, label }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center px-2.5 text-sm transition-colors sm:px-3",
                      active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                    {active && <span className="absolute inset-x-2.5 bottom-0 h-px bg-foreground sm:inset-x-3" />}
                  </Link>
                );
              })}
            </nav>
          )}
          <ThemeToggle />
          {showNav && (
            <Link
              href="/profile"
              aria-label="Profile"
              aria-current={profileActive ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                profileActive && "bg-accent text-foreground"
              )}
            >
              <UserRound className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
