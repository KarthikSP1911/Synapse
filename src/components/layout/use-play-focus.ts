"use client";

import { useEffect } from "react";

/**
 * While `active`, the page is one screen tall and cannot scroll, and on phones the header and tab bar are hidden
 * (see "Full-screen play" in globals.css). Used by games whose play screen uses `.play-screen`.
 */
export function usePlayFocus(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.classList.add("play-focus");
    return () => root.classList.remove("play-focus");
  }, [active]);
}
