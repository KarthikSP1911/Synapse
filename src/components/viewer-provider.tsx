"use client";

import { createContext, useContext, useMemo } from "react";
import type { LocalStore } from "@/lib/guest/api";
import { storeFor, type ViewerInfo } from "@/lib/local-store";

const ViewerContext = createContext<ViewerInfo>({ kind: null });

/**
 * Tells client components who is using the app. It comes from the server-rendered layout, so a page
 * served from the offline cache still knows whose browser-side data to read.
 */
export function ViewerProvider({ viewer, children }: { viewer: ViewerInfo; children: React.ReactNode }) {
  const kind = viewer.kind;
  const userId = viewer.kind === "user" ? viewer.userId : null;
  const value = useMemo<ViewerInfo>(() => (kind === "user" && userId !== null ? { kind, userId } : kind === "guest" ? { kind } : { kind: null }), [kind, userId]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export const useViewerInfo = (): ViewerInfo => useContext(ViewerContext);

/** The local store for the current viewer (stable between renders), or null when nobody is signed in. */
export function useLocalStore(): LocalStore | null {
  const viewer = useViewerInfo();
  const userId = viewer.kind === "user" ? viewer.userId : null;
  const kind = viewer.kind;
  return useMemo(() => storeFor(kind === "user" && userId !== null ? { kind, userId } : kind === "guest" ? { kind } : { kind: null }), [kind, userId]);
}
