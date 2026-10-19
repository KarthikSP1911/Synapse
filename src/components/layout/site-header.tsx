"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, Grid3x3, Settings, Target, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LogoMark } from "@/components/layout/logo-mark";
import { ConnectionBadge } from "@/features/offline/components/connection-badge";
import { CoinBadge } from "@/features/rewards/components/coin-badge";
import { TimerHeaderButton } from "@/features/timer/components/timer-header-button";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/features/profile/components/avatar";

const links = [
  { href: "/", label: "Practice", icon: Target },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { href: "/tables", label: "Tables", icon: Grid3x3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Where the tab bar is shown: phones only, for signed-in or guest visitors, never on the focus-view practice screen or the auth screens. */
export function showsMobileNav(pathname: string, viewer: "user" | "guest" | null) {
  return viewer !== null && !/^\/(practice\/\d+|play|login|signup)$/.test(pathname);
}

/** Whether the page has a header at all, so a hidden study timer has somewhere to collapse into (not the focus screens or the auth screens). */
export function headerCarriesTimerIcon(pathname: string) {
  return !/^\/(practice\/\d+|play|login|signup)$/.test(pathname);
}

/** Height of the tab bar without the device's bottom inset; other bottom-fixed UI offsets itself by this much. */
export const MOBILE_NAV_HEIGHT = "3.75rem";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="Synapse home">
      <LogoMark className="size-9" />
      <span className="text-[15px] font-semibold tracking-tight">Synapse</span>
    </Link>
  );
}

function NavLinks({ pathname, className, linkClassName }: { pathname: string; className: string; linkClassName: string }) {
  return (
    <nav aria-label="Main" className={className}>
      {links.map(({ href, label }) => {
        const active = isNavActive(href, pathname);
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
            {active && <span className="spectrum-underline absolute inset-x-2.5 bottom-0 h-0.5 rounded-full sm:inset-x-3" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteHeader({ viewer, avatar }: { viewer: "user" | "guest" | null; avatar?: string }) {
  const pathname = usePathname();

  // The live practice screen is a focus view: no navigation to distract from the question.
  if (/^\/(practice\/\d+|play)$/.test(pathname)) return null;

  // Visitors with neither an account nor guest mode only see the login and sign-up screens, so there is nothing to navigate to.
  // The same goes for a guest who opens those screens to sign up: they keep the compact header the screens are sized for.
  const onAuthScreen = pathname === "/login" || pathname === "/signup";
  const showNav = viewer !== null && !onAuthScreen;
  const profileActive = pathname.startsWith("/profile");

  return (
    <header data-chrome className="sticky top-0 z-50 border-b border-border bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-3">
          {/* From `sm` up the links sit beside the logo; on phones they move to the tab bar at the bottom (MobileNav). */}
          {showNav && <NavLinks pathname={pathname} className="hidden h-14 items-stretch sm:flex" linkClassName="px-3" />}
          <ConnectionBadge />
          <ThemeToggle />
          {viewer !== null && !onAuthScreen && <TimerHeaderButton />}
          {viewer !== null && !onAuthScreen && <CoinBadge />}
          {viewer === "guest" && !onAuthScreen && (
            <>
              <Link
                href="/profile"
                aria-label="Profile"
                aria-current={profileActive ? "page" : undefined}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), profileActive && "bg-accent text-foreground")}
              >
                <UserRound className="size-4" />
              </Link>
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
              {avatar ? <Avatar id={avatar} className="size-7 pointer-coarse:size-8" /> : <UserRound className="size-4" />}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Bottom tab bar for phones, in the style of a native app: an icon over a label, with a pill behind the current one. */
export function MobileNav({ viewer }: { viewer: "user" | "guest" | null }) {
  const pathname = usePathname();
  if (!showsMobileNav(pathname, viewer)) return null;

  return (
    <>
      {/* Keeps the end of every page clear of the fixed bar. */}
      <div data-chrome aria-hidden className="sm:hidden" style={{ height: `calc(${MOBILE_NAV_HEIGHT} + env(safe-area-inset-bottom))` }} />
      <nav
        data-chrome
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <ul className="grid grid-cols-4" style={{ height: MOBILE_NAV_HEIGHT }}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(href, pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-full flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                    active ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-14 place-items-center rounded-full transition-[background-color,transform] duration-200 group-active:scale-90",
                      active && "bg-accent"
                    )}
                  >
                    <Icon className={cn("size-5 transition-transform duration-200", active && "scale-110")} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
