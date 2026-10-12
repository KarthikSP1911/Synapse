/**
 * Whether a main-navigation link is the current page. Practice is `/` and also every skill page under
 * `/skills/*`; the other links match their own path and anything below it.
 */
export const isNavActive = (href: string, pathname: string): boolean =>
  href === "/" ? pathname === "/" || pathname === "/skills" || pathname.startsWith("/skills/") : pathname.startsWith(href);
