import { ImageResponse } from "next/og";

/** Icon files the web app manifest points at. `maskable` icons keep the mark inside the safe zone so Android can crop them to any shape. */
export const PWA_ICONS = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
} as const;

export type PwaIconFile = keyof typeof PWA_ICONS;

export const isPwaIconFile = (file: string): file is PwaIconFile => Object.hasOwn(PWA_ICONS, file);

/**
 * The tile colour. It is exactly the manifest's `background_color`: Android paints its launch screen from this
 * icon on that colour, so any difference shows up as a visible square behind the mark.
 */
const TILE = "#000000";

/** The Mathz mark on a pure black tile. */
export function renderPwaIcon(file: PwaIconFile) {
  const { size, maskable } = PWA_ICONS[file];
  const mark = Math.round(size * (maskable ? 0.5 : 0.66));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: TILE,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <rect x="0" y="0" width="15" height="15" rx="3.5" fill="#fafafa" />
          <rect x="17" y="0" width="15" height="15" rx="3.5" fill="#71717a" />
          <rect x="0" y="17" width="15" height="15" rx="3.5" fill="#71717a" />
          <rect x="17" y="17" width="15" height="15" rx="3.5" fill="#fafafa" />
          <g fill="none" stroke={TILE} strokeWidth="2.4" strokeLinecap="round">
            <path d="M4.5 7.5h6M7.5 4.5v6" />
            <path d="M21.5 7.5h6" />
            <path d="M5.5 21.5l4 4M9.5 21.5l-4 4" />
            <path d="M21.5 24.5h6" />
          </g>
          <circle cx="24.5" cy="21" r="1.3" fill={TILE} />
          <circle cx="24.5" cy="28" r="1.3" fill={TILE} />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
