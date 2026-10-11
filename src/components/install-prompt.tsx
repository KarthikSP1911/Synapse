"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo-mark";

/** The event Chromium browsers fire when the app is installable; it is not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "native" | "ios";

declare global {
  interface Window {
    /** Set by the early script in the root layout, which catches the event before React has hydrated. */
    __mathzInstallEvent?: BeforeInstallPromptEvent;
  }
}

/** Fired by that same script whenever it has stored a (new) install event. */
export const INSTALLABLE_EVENT = "mathz:installable";

const STORAGE_KEY = "mathz-install-prompt";
const SHOW_DELAY_MS = 4000;
/** After "Not now" the banner stays away for two weeks; after closing the native dialog, for three days. */
const SNOOZE_MS = { later: 14 * 24 * 60 * 60 * 1000, declined: 3 * 24 * 60 * 60 * 1000 };

interface Stored {
  installed?: boolean;
  snoozedUntil?: number;
}

// Storage can throw (private windows, blocked site data), so every access is guarded.
function readStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

function writeStored(patch: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), ...patch }));
  } catch {
    /* the banner just comes back next visit */
  }
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhones and iPads (iPadOS reports itself as a Mac with a touch screen). */
const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Safari is the only iOS browser where the Share-sheet steps below are the same; in-app browsers cannot install at all. */
const isIosSafari = () => isIos() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent);

/** Phones and tablets only: a touch-first device. Desktop browsers keep their own install button in the address bar. */
const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

export function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode | null>(null);
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const eligible = () => isTouchDevice() && !isStandalone() && !readStored().installed && Date.now() >= (readStored().snoozedUntil ?? 0);

    // Wait before showing anything so the banner never competes with the first paint or the first tap.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reveal = (next: Mode) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!eligible()) return;
        setMode(next);
        setVisible(true);
      }, SHOW_DELAY_MS);
    };

    // The browser may have announced installability before this component mounted, so check what the early script stored.
    const adoptInstallEvent = () => {
      const event = window.__mathzInstallEvent;
      if (!event) return;
      setDeferred(event);
      if (eligible()) reveal("native");
    };
    const onInstalled = () => {
      writeStored({ installed: true });
      window.__mathzInstallEvent = undefined;
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener(INSTALLABLE_EVENT, adoptInstallEvent);
    window.addEventListener("appinstalled", onInstalled);
    adoptInstallEvent();

    // iOS never fires beforeinstallprompt, so show the manual steps instead.
    if (eligible() && isIosSafari()) reveal("ios");

    return () => {
      clearTimeout(timer);
      window.removeEventListener(INSTALLABLE_EVENT, adoptInstallEvent);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const snooze = useCallback((kind: keyof typeof SNOOZE_MS) => {
    writeStored({ snoozedUntil: Date.now() + SNOOZE_MS[kind] });
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setVisible(false);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "dismissed") snooze("declined");
      // On "accepted" the `appinstalled` event records the install.
    } catch (err) {
      console.error(err);
    } finally {
      // A prompt event can only be used once; Chromium fires a fresh one if it is still installable.
      window.__mathzInstallEvent = undefined;
      setDeferred(null);
    }
  }, [deferred, snooze]);

  // The live practice screen is a focus view: nothing may cover the question or the answer box.
  if (!visible || !mode || /^\/(practice\/\d+|play)$/.test(pathname)) return null;

  return (
    <section
      aria-label="Install Mathz"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in fade-in slide-in-from-bottom-4 duration-300 sm:hidden"
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-pop">
        <LogoMark className="mt-0.5 size-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight">Install Mathz</p>
          {mode === "native" ? (
            <>
              <p className="mt-0.5 text-sm text-muted-foreground">Add it to your home screen for full-screen practice that works even with no signal.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={install}>
                  Install app
                </Button>
                <Button size="sm" variant="ghost" onClick={() => snooze("later")}>
                  Not now
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tap <Share aria-label="Share" className="mx-0.5 inline size-4 -translate-y-px" /> in the toolbar, then{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>{" "}
                <Plus aria-hidden className="inline size-4 -translate-y-px" />.
              </p>
              <div className="mt-3">
                <Button size="sm" variant="ghost" onClick={() => snooze("later")}>
                  Got it
                </Button>
              </div>
            </>
          )}
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss install prompt" className="-mr-1 -mt-1 shrink-0" onClick={() => snooze("later")}>
          <X />
        </Button>
      </div>
    </section>
  );
}
