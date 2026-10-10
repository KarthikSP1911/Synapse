import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

/**
 * Optimistic gate: a request with no session cookie never reaches a page or API route. This only
 * checks that the cookie exists; every page and route still verifies it against the database
 * (`requireUser` / `getCurrentUser`), so a forged or expired cookie gets nothing.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  if (isAuthPage || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets and files with an extension (icons, images).
  matcher: ["/((?!_next/static|_next/image|apple-icon|.*\\.[a-z0-9]+$).*)"],
};
