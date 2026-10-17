"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useViewerInfo } from "@/features/auth/components/viewer-provider";
import { BackFace, FrontFace, IdleFace } from "@/features/timer/components/timer-faces";
import { TimerBanner, TimeUpBadge } from "@/features/timer/components/timer-banner";
import { TimerOptionsMenu } from "@/features/timer/components/timer-options-menu";
import { TimerSetupPopover } from "@/features/timer/components/timer-setup-popover";
import { useTimerSnapshot, useTimerView } from "@/features/timer/components/use-timer-state";
import { useWidgetPlacement } from "@/features/timer/components/use-widget-placement";
import { snapCorner, spotRect, type Placement, type Point, type Size } from "@/features/timer/lib/corner";
import { formatOver, formatRemaining } from "@/features/timer/lib/duration";
import { LONG_PRESS_MS, exceedsSlop, releaseGesture } from "@/features/timer/lib/gesture";
import { unlockAlertSound } from "@/features/timer/lib/alert";
import { studyTimer } from "@/features/timer/lib/store";
import { TIMER_STATE_KEY, loadPrefs, saveLastMinutes, savePrefs, type WidgetPrefs } from "@/features/timer/lib/storage";

/** Edge length of the widget: normally, while the user is in a game or session, and as a last resort when space is tight. */
const FULL = 72;
const COMPACT = 48;
const PIP = 28;
const square = (n: number): Size => ({ width: n, height: n });
const FULL_SIZES = [square(FULL), square(COMPACT), square(PIP)];
const COMPACT_SIZES = [square(COMPACT), square(PIP)];

const subscribeNothing = () => () => {};

type Panel = "setup" | "menu" | null;

interface Press {
  start: Point;
  moved: boolean;
  heldLong: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * The study timer, as a floating button on every page. Idle it is a stopwatch icon that opens the length chooser; running it is a
 * two-sided card (countdown / still clock); past zero it shows the overrun. It can be dragged to any corner, shrinks and fades
 * while the user is in a game or session, and moves out of the way of anything a screen marks `data-timer-clear`.
 * Mounted once in the root layout, so it is the same timer on every page.
 */
export function FloatingTimer() {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const viewer = useViewerInfo();
  const pathname = usePathname();
  const router = useRouter();
  const descId = useId();

  // The timer belongs to whoever set it: a guest, or one signed-in account.
  const viewerTag = viewer.kind === "user" ? `user:${viewer.userId}` : viewer.kind === "guest" ? "guest" : null;
  const snapshot = useTimerSnapshot();
  const view = useTimerView(snapshot);
  const [prefs, setPrefs] = useState<WidgetPrefs>(loadPrefs);
  const [panel, setPanel] = useState<Panel>(null);
  const [drag, setDrag] = useState<Point | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const press = useRef<Press | null>(null);
  const quitting = useRef(false);

  const hasTimer = snapshot.timer !== null;
  const compact = snapshot.activity !== null;
  const expired = view.phase === "waiting" || view.phase === "alerting" || view.phase === "overrun";
  // Past zero the overrun must be visible, so the focus side is not offered.
  const side = expired ? "front" : prefs.side;
  const openPanel: Panel = panel === "setup" && !hasTimer ? "setup" : panel === "menu" && hasTimer ? "menu" : null;
  const showAlert = view.phase === "alerting" || view.phase === "overrun";

  // ---- Wiring to the shared timer ------------------------------------------------

  useEffect(() => {
    if (mounted) studyTimer().setViewer(viewerTag);
  }, [mounted, viewerTag]);

  // Time passes while the page is asleep, and another tab may have changed the timer.
  useEffect(() => {
    if (!mounted) return;
    const timer = studyTimer();
    const wake = () => timer.wake();
    const onVisible = () => {
      if (document.visibilityState === "visible") timer.wake();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TIMER_STATE_KEY || event.key === null) timer.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("storage", onStorage);
    };
  }, [mounted]);

  // After a refresh the browser keeps audio locked until the next tap anywhere, so the first one unlocks the alert sound.
  useEffect(() => {
    if (!hasTimer) return;
    const unlock = () => unlockAlertSound();
    const options = { once: true, capture: true } as const;
    window.addEventListener("pointerdown", unlock, options);
    window.addEventListener("keydown", unlock, options);
    return () => {
      window.removeEventListener("pointerdown", unlock, options);
      window.removeEventListener("keydown", unlock, options);
    };
  }, [hasTimer]);

  // ---- Where the widget sits ---------------------------------------------------------

  const sizes = useMemo(() => (compact ? COMPACT_SIZES : FULL_SIZES), [compact]);
  const enabled = mounted && viewerTag !== null;
  const layout = useWidgetPlacement(prefs.corner, sizes, enabled, `${pathname}|${compact}|${hasTimer}|${showAlert}`);

  const closePanel = useCallback((refocus: boolean) => {
    setPanel(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!openPanel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openPanel]);

  // ---- Actions -------------------------------------------------------------------

  const updatePrefs = useCallback((next: WidgetPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const start = useCallback(
    (minutes: number) => {
      saveLastMinutes(minutes);
      // This tap is the moment the browser lets the alert sound be unlocked.
      unlockAlertSound();
      studyTimer().start(minutes);
      updatePrefs({ ...prefs, side: "front" });
      closePanel(true);
    },
    [prefs, updatePrefs, closePanel]
  );

  const quit = useCallback(async () => {
    if (quitting.current) return;
    quitting.current = true;
    try {
      // Save and sync what is unfinished, clear the timer, then go home (navigating also makes the sync manager upload).
      await studyTimer().quit();
      router.push("/");
    } finally {
      quitting.current = false;
    }
  }, [router]);

  const activate = useCallback(() => {
    if (!hasTimer) setPanel((current) => (current === "setup" ? null : "setup"));
    else if (!expired) updatePrefs({ ...prefs, side: prefs.side === "front" ? "back" : "front" });
  }, [hasTimer, expired, prefs, updatePrefs]);

  const openMenu = useCallback(() => {
    if (hasTimer) setPanel("menu");
  }, [hasTimer]);

  // ---- Pointer: tap flips, long-press opens options, dragging moves it ----------------------

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is only an aid for dragging.
    }
    const state: Press = { start: { x: event.clientX, y: event.clientY }, moved: false, heldLong: false, timer: undefined };
    state.timer = setTimeout(() => {
      if (press.current !== state || state.moved) return;
      state.heldLong = true;
      openMenu();
    }, LONG_PRESS_MS);
    press.current = state;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = press.current;
    if (!state) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!state.moved && exceedsSlop(state.start, point)) {
      state.moved = true;
      clearTimeout(state.timer);
      setPanel(null);
    }
    if (state.moved) setDrag({ x: point.x - state.start.x, y: point.y - state.start.y });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = press.current;
    press.current = null;
    if (!state) return;
    clearTimeout(state.timer);
    const gesture = releaseGesture(state);
    if (gesture === "drag" && layout?.placement) {
      const { rect, size } = layout.placement;
      const centre = { x: (rect.left + rect.right) / 2 + event.clientX - state.start.x, y: (rect.top + rect.bottom) / 2 + event.clientY - state.start.y };
      updatePrefs({ ...prefs, corner: snapCorner(centre, layout.viewport, size) });
      setDrag(null);
    } else if (gesture === "tap") {
      activate();
    }
  };

  const onPointerCancel = () => {
    const state = press.current;
    press.current = null;
    if (state) clearTimeout(state.timer);
    setDrag(null);
  };

  // ---- Render ----------------------------------------------------------------------

  if (!enabled || !layout) return null;
  let placement: Placement | null = layout.placement;
  if (!placement) {
    // No free spot for the widget itself; the alert must still be reachable, so it takes the smallest size in the remembered corner.
    if (!showAlert) return null;
    const size = square(PIP);
    placement = { spot: { kind: "corner", corner: prefs.corner }, size, rect: spotRect({ kind: "corner", corner: prefs.corner }, layout.viewport, size) };
  }

  const size = placement.size.width;
  const x = placement.rect.left + (drag?.x ?? 0);
  const y = placement.rect.top + (drag?.y ?? 0);
  const below = (placement.rect.top + placement.rect.bottom) / 2 < layout.viewport.height / 2;
  const alignRight = (placement.rect.left + placement.rect.right) / 2 > layout.viewport.width / 2;
  const hidden = layout.placement === null;
  const dim = compact && openPanel === null && drag === null && !showAlert;

  const label = !hasTimer
    ? "Start a study timer"
    : expired
      ? "Study timer: time is up"
      : `Study timer, showing the ${side === "front" ? "countdown" : "focus view"}. Press to flip.`;
  const spoken = view.phase === "running" ? `${formatRemaining(view.remainingMs)} left` : view.phase === "off" ? "" : `${formatOver(view.overMs)}`;

  return (
    <div
      ref={rootRef}
      data-dragging={drag !== null}
      className="st-root group fixed left-0 top-0 z-[75]"
      style={{ width: size, height: size, transform: `translate3d(${x}px, ${y}px, 0)` }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && openPanel) {
          event.stopPropagation();
          closePanel(true);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={hasTimer ? descId : undefined}
        aria-haspopup={hasTimer ? "menu" : "dialog"}
        aria-expanded={openPanel !== null}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // A keyboard press arrives as a click with no pointer (detail 0); a pointer press is handled on release above.
        onClick={(event) => {
          if (event.detail === 0) activate();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu();
        }}
        className={cn(
          "st-stage block size-full touch-none select-none rounded-full outline-none transition-opacity duration-200 [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
          hidden && "pointer-events-none opacity-0",
          dim && "opacity-50 hover:opacity-100 focus-visible:opacity-100"
        )}
      >
        <span className="st-card block" data-side={side}>
          {hasTimer ? (
            <>
              <FrontFace view={view} size={size} />
              <BackFace />
            </>
          ) : (
            <IdleFace />
          )}
        </span>
      </button>
      {hasTimer && <span id={descId} className="sr-only">{spoken}</span>}

      {hasTimer && !hidden && size >= 36 && (
        <button
          type="button"
          aria-label="Study timer options"
          aria-haspopup="menu"
          onClick={() => setPanel((current) => (current === "menu" ? null : "menu"))}
          className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border border-border bg-popover text-[11px] leading-none text-muted-foreground opacity-0 shadow-card outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <span aria-hidden>⋯</span>
        </button>
      )}

      {(openPanel || showAlert) && (
        <div className={cn("absolute flex gap-2", below ? "top-full mt-2 flex-col" : "bottom-full mb-2 flex-col-reverse", alignRight ? "right-0 items-end" : "left-0 items-start")}>
          {openPanel === "setup" && <TimerSetupPopover onStart={start} />}
          {openPanel === "menu" && (
            <TimerOptionsMenu
              canExtend={snapshot.timer?.alertedAt === null}
              onExtend={() => {
                studyTimer().extend();
                closePanel(true);
              }}
              onStop={() => {
                studyTimer().stop();
                closePanel(true);
              }}
            />
          )}
          {view.phase === "alerting" && <TimerBanner leftMs={view.bannerLeftMs} onQuit={quit} />}
          {view.phase === "overrun" && <TimeUpBadge onQuit={quit} />}
        </div>
      )}
    </div>
  );
}
