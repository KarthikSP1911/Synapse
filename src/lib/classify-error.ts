/**
 * What an error means for the person looking at it. A Server Action or a script that no longer exists means the page
 * was opened before the app was updated, and only a reload (not a retry) fixes it; no connection means just that;
 * anything else is shown as a failure to load.
 */
export function classifyError(error: { message?: string }, online: boolean): "offline" | "outdated" | "failed" {
  if (!online) return "offline";
  if (/server action|failed to find|chunk|loading css chunk|dynamically imported module/i.test(error.message ?? "")) return "outdated";
  return "failed";
}
