"use client";

import { useEffect, useState } from "react";

/**
 * The session id in the page's `?s=` query, read from the address bar after mount.
 *
 * The play pages are one cached shell shared by every session, so they must not take the id from the
 * server-rendered payload (which would be the id of whichever session the shell was cached for).
 * `undefined` means "not read yet"; `null` means there is no valid id.
 */
export function useSessionIdFromUrl(): number | null | undefined {
  const [id, setId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => {
      const raw = new URLSearchParams(window.location.search).get("s");
      const parsed = raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
      setId(Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return id;
}
