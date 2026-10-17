"use client";

import { useEffect, useState } from "react";
import { placeWidget, type Placement, type Rect, type Size, type Viewport } from "@/features/timer/lib/corner";
import type { Corner } from "@/features/timer/lib/storage";

/** Gap kept between the widget and the screen edge, the header and the tab bar. */
const MARGIN = 12;
/** Screens mark what the widget must never cover (the board, the answer box, the keypad) with this attribute. */
export const CLEAR_ATTRIBUTE = "data-timer-clear";

let probe: HTMLElement | null = null;

/** The device's safe-area insets (notch, home bar), which only CSS can report. */
function safeArea() {
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  return { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
}

/** The element's box if it is actually showing (a hidden header or tab bar has no size). */
function shown(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

export function measureViewport(): Viewport {
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const safe = safeArea();
  const header = shown("header[data-chrome]");
  const tabBar = shown("nav[data-chrome]");
  return {
    width,
    height,
    insets: {
      top: Math.max(safe.top, header && header.bottom > 0 ? header.bottom : 0) + MARGIN,
      right: safe.right + MARGIN,
      bottom: Math.max(safe.bottom, tabBar ? height - tabBar.top : 0) + MARGIN,
      left: safe.left + MARGIN,
    },
  };
}

export function measureObstacles(viewport: Viewport): Rect[] {
  const found: Rect[] = [];
  for (const el of document.querySelectorAll(`[${CLEAR_ATTRIBUTE}]`)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.right <= 0 || r.top >= viewport.height || r.left >= viewport.width) continue;
    found.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return found;
}

export interface WidgetLayout {
  /** Where the widget goes, or null when there is no room anywhere (it then hides; the banner still works). */
  placement: Placement | null;
  viewport: Viewport;
}

const key = (l: WidgetLayout) => JSON.stringify([l.placement?.spot ?? null, l.placement?.size ?? null, l.viewport]);
const same = (a: WidgetLayout | null, b: WidgetLayout): boolean => !!a && key(a) === key(b);

/**
 * Works out where the widget sits: the remembered corner unless something marked `data-timer-clear` is under it, then the
 * nearest free spot, shrinking before giving up. It re-checks when the window changes, when the screen's content changes
 * (a game starting, a keypad opening) and whenever `recheck` changes (a route or activity change).
 */
export function useWidgetPlacement(corner: Corner, sizes: readonly Size[], enabled: boolean, recheck: unknown): WidgetLayout | null {
  const [layout, setLayout] = useState<WidgetLayout | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const compute = () => {
      const viewport = measureViewport();
      const next: WidgetLayout = { placement: placeWidget(corner, viewport, sizes, measureObstacles(viewport)), viewport };
      setLayout((current) => (same(current, next) ? current : next));
    };
    // Content changes come in bursts (a flashing number, a typing answer): look at most every 150 ms.
    const soon = () => {
      if (pending !== undefined) return;
      pending = setTimeout(() => {
        pending = undefined;
        compute();
      }, 150);
    };
    frame = requestAnimationFrame(compute);
    window.addEventListener("resize", soon);
    window.addEventListener("orientationchange", soon);
    window.visualViewport?.addEventListener("resize", soon);
    const observer = new MutationObserver(soon);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", CLEAR_ATTRIBUTE] });
    // `play-focus` on <html> hides the header and tab bar on phones.
    const htmlObserver = new MutationObserver(soon);
    htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(frame);
      if (pending !== undefined) clearTimeout(pending);
      window.removeEventListener("resize", soon);
      window.removeEventListener("orientationchange", soon);
      window.visualViewport?.removeEventListener("resize", soon);
      observer.disconnect();
      htmlObserver.disconnect();
    };
  }, [corner, sizes, enabled, recheck]);

  return enabled ? layout : null;
}
