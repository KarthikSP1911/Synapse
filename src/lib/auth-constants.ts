/** Kept free of server-only imports so the proxy can use it. */
export const SESSION_COOKIE = "mathz_session";
/**
 * Marks a browser as playing as a guest. It carries no identity and grants no access to data: guest
 * progress lives in that browser's localStorage and the API still refuses guests. It only lets the
 * pages render their guest versions instead of redirecting to the login screen.
 */
export const GUEST_COOKIE = "mathz_guest";
