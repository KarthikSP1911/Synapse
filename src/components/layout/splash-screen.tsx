import { LogoMark } from "@/components/layout/logo-mark";

/**
 * Intro shown when the app is opened: the brain is revealed from the circuit side to the colour side while a
 * thin progress bar fills beneath it, then the whole screen fades away (see `.splash` in globals.css). It is
 * pure CSS, so it needs no JavaScript to leave, and it continues straight on from the black native launch
 * screen. The inline script in the root layout marks the session so it plays once per launch rather than on
 * every page load.
 */
export function SplashScreen() {
  return (
    <div aria-hidden className="splash">
      <div className="flex flex-col items-center gap-7">
        <LogoMark src="/brand/synapse-splash.png" className="splash-logo size-[180px]" />
        <div className="splash-bar" />
      </div>
    </div>
  );
}
