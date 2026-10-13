"use client";

import { useEffect } from "react";

/**
 * While `active`, the page is one screen tall and cannot scroll, and on phones the header and tab bar are hidden
 * (see "Full-screen play" in globals.css). Used by games whose play screen uses `.play-screen`.
 * With `mediaQuery`, it only applies while the query matches (Sudoku keeps its scrolling desktop layout on wide screens).
 */
export function usePlayFocus(active: boolean, mediaQuery?: string) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const query = mediaQuery ? window.matchMedia(mediaQuery) : null;
    const apply = () => root.classList.toggle("play-focus", !query || query.matches);
    apply();
    query?.addEventListener("change", apply);
    return () => {
      query?.removeEventListener("change", apply);
      root.classList.remove("play-focus");
    };
  }, [active, mediaQuery]);
}
