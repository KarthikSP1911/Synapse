"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/logo-mark";
import { ConnectionBadge } from "@/components/connection-badge";
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

function NavLinks({ pathname, className, linkClassName }: { pathname: string; className: string; linkClassName: string }) {
  return (
    <nav aria-label="Main" className={className}>
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center text-sm transition-colors",
              linkClassName,
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {active && <span className="absolute inset-x-2.5 bottom-0 h-px bg-foreground sm:inset-x-3" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteHeader({ viewer }: { viewer: "user" | "guest" | null }) {
  const pathname = usePathname();

  // The live practice screen is a focus view: no navigation to distract from the question.
  if (/^\/(practice\/\d+|play)$/.test(pathname)) return null;

  // Visitors with neither an account nor guest mode only see the login and sign-up screens, so there is nothing to navigate to.
  // The same goes for a guest who opens those screens to sign up: they keep the compact header the screens are sized for.
  const onAuthScreen = pathname === "/login" || pathname === "/signup";
  const showNav = viewer !== null && !onAuthScreen;
  const profileActive = pathname.startsWith("/profile");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-3">
          {/* From `sm` up the links sit beside the logo; on phones they get their own row below, so nothing is clipped. */}
          {showNav && <NavLinks pathname={pathname} className="hidden h-14 items-stretch sm:flex" linkClassName="px-3" />}
          <ConnectionBadge />
          <ThemeToggle />
          {viewer === "guest" && !onAuthScreen && (
            <>
              <span
                className="hidden rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline"
                title="Your progress is saved in this browser only"
              >
                Guest
              </span>
              <Link href="/signup" className={buttonVariants({ size: "sm" })}>
                Sign up
              </Link>
            </>
          )}
          {viewer === "user" && (
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
      {showNav && (
        <div className="container border-t border-border sm:hidden">
          <NavLinks pathname={pathname} className="grid h-11 grid-cols-4" linkClassName="justify-center" />
        </div>
      )}
    </header>
  );
}
