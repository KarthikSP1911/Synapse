import { LogoMark } from "@/components/logo-mark";

/**
 * Intro shown when the app is opened: the mark builds up tile by tile, then the name rises beneath it, then
 * the whole screen fades away (see `.splash` in globals.css). It is pure CSS, so it needs no JavaScript to
 * leave, and it continues straight on from the black native launch screen. The inline script in the root
 * layout marks the session so it plays once per launch rather than on every page load.
 */
export function SplashScreen() {
  return (
    <div aria-hidden className="splash">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="splash-logo size-24" />
        <span className="splash-name text-3xl font-semibold tracking-tight">Mathz</span>
      </div>
    </div>
  );
}
