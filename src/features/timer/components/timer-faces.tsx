import { formatOver, formatRemaining } from "@/features/timer/lib/duration";
import type { TimerView } from "@/features/timer/lib/types";

/**
 * The faces of the floating timer. They only draw; the widget decides which one shows.
 * The stopwatch is drawn in one fixed palette (black outline, blue body, grey crown and buttons, pale dial) so it reads the
 * same in light and dark mode. The digits sit on the pale dial, so they use fixed dark colours too.
 */

const INK = "#000";
const BLUE = "#66b5ff";
const BLUE_SHADE = "#29a3ff";
const GREY = "#b4b4b4";
const GREY_SHADE = "#979797";
const DIAL = "#e8eef2";
const DIAL_SHADE = "#d6e1e8";
const RED = "#f0606a";
const DIGITS = "#15171c";
/** The dial's amber for the overrun (the light-mode warning colour, dark enough on the pale dial). */
const DIGITS_OVER = "#b45309";

/** The dial's centre as a share of the icon's width and height. */
const DIAL_CENTRE_X = 50;
const DIAL_CENTRE_Y = 56.6;
/** The dial's diameter as a share of the icon's width. */
const DIAL_SHARE = 0.656;

const AT = [0, 45, 90, 135, 180, 225, 270, 315];

/** A stopwatch icon. `analog` draws the dial's tick marks and hands; without it the dial is left clear for digits. */
function StopwatchIcon({ analog }: { analog: boolean }) {
  const stroke = { stroke: INK, strokeWidth: 16, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 512 512" aria-hidden className="absolute inset-0 size-full drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]">
      {/* The two side buttons */}
      <g transform="rotate(-35 104 104)">
        <rect x="72" y="104" width="62" height="40" fill={GREY_SHADE} {...stroke} />
        <rect x="48" y="62" width="110" height="52" rx="8" fill={GREY} {...stroke} />
      </g>
      <g transform="rotate(35 408 104)">
        <rect x="378" y="104" width="62" height="40" fill={GREY_SHADE} {...stroke} />
        <rect x="354" y="62" width="110" height="52" rx="8" fill={GREY} {...stroke} />
        <rect x="412" y="70" width="42" height="36" fill={GREY_SHADE} />
      </g>

      {/* The crown */}
      <rect x="226" y="52" width="60" height="50" fill={GREY_SHADE} {...stroke} />
      <rect x="198" y="8" width="116" height="52" rx="10" fill={BLUE} {...stroke} />
      <rect x="284" y="16" width="22" height="36" fill={BLUE_SHADE} />

      {/* The body: a darker crescent shows on its right and underside */}
      <circle cx="256" cy="286" r="212" fill={BLUE_SHADE} />
      <circle cx="240" cy="282" r="198" fill={BLUE} />
      <circle cx="256" cy="286" r="212" fill="none" {...stroke} />

      {/* The dial */}
      <circle cx="256" cy="290" r="168" fill={DIAL_SHADE} />
      <circle cx="246" cy="286" r="160" fill={DIAL} />
      <circle cx="256" cy="290" r="168" fill="none" {...stroke} />

      {analog && (
        <>
          {AT.map((deg) => (
            <line key={deg} x1="256" y1="172" x2="256" y2="148" transform={`rotate(${deg} 256 290)`} {...stroke} />
          ))}
          <line x1="256" y1="290" x2="334" y2="290" {...stroke} />
          <circle cx="256" cy="290" r="24" fill={RED} {...stroke} strokeWidth={14} />
        </>
      )}
    </svg>
  );
}

/** Idle: the whole stopwatch, still, with no numbers. */
export function IdleFace() {
  return (
    <span className="st-face">
      <StopwatchIcon analog />
    </span>
  );
}

/** Front: the stopwatch with the digital countdown centred on its dial, or "+1:20" and "over" once past zero. */
export function FrontFace({ view, size }: { view: TimerView; size: number }) {
  const over = view.phase !== "running";
  const text = over ? formatOver(view.overMs).replace(" over", "") : formatRemaining(view.remainingMs);
  // The digits are fitted to the dial: about 0.6 em per character, kept inside 80% of the dial's width.
  const fontSize = Math.min(size * 0.3, (0.8 * DIAL_SHARE * size) / (0.6 * text.length));
  return (
    <span className="st-face">
      <StopwatchIcon analog={false} />
      {size >= 36 && (
        <span
          aria-hidden
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center font-mono font-bold leading-none tabular-nums"
          style={{ left: `${DIAL_CENTRE_X}%`, top: `${DIAL_CENTRE_Y}%`, fontSize, color: over ? DIGITS_OVER : DIGITS }}
        >
          {text}
          {over && size >= 56 && (
            <span className="mt-[2px] font-sans font-semibold uppercase tracking-wide" style={{ fontSize: size * 0.1 }}>
              over
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** Back: the same stopwatch showing its still, analog dial, with no numbers and no motion. A focus view. */
export function BackFace() {
  return (
    <span className="st-face st-face-back">
      <StopwatchIcon analog />
    </span>
  );
}
