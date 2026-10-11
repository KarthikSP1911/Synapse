import { GUEST_STORE, createLocalFetch, type LocalStore } from "@/lib/guest/api";
import { userStorageKey } from "@/lib/guest/storage";

/** Who is using this device, as far as the browser-side code needs to know. */
export type ViewerInfo = { kind: "guest" } | { kind: "user"; userId: number } | { kind: null };

/** The local store that holds this viewer's practice: the guest's, the account's offline copy, or none. */
export function storeFor(viewer: ViewerInfo): LocalStore | null {
  if (viewer.kind === "guest") return GUEST_STORE;
  if (viewer.kind === "user") return { key: userStorageKey(viewer.userId), syncable: true };
  return null;
}

const fetchers = new Map<string, ReturnType<typeof createLocalFetch>>();

/** A stable (cached) local fetch for the store, so React effects that depend on it do not re-run every render. */
export function localFetchFor(store: LocalStore): ReturnType<typeof createLocalFetch> {
  let fetcher = fetchers.get(store.key);
  if (!fetcher) {
    fetcher = createLocalFetch(store);
    fetchers.set(store.key, fetcher);
  }
  return fetcher;
}

/** Where a practice session lives. Local sessions all use the same static pages, so the id travels in the query string. */
export const playHref = (sessionId: number | string) => `/play?s=${sessionId}`;
export const summaryHref = (sessionId: number | string) => `/play/summary?s=${sessionId}`;
