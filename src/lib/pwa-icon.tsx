import { ImageResponse } from "next/og";
import { LOGO_VIEW_BOX, logoShapes } from "@/components/layout/logo-mark";

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
        <svg width={mark} height={mark} viewBox={LOGO_VIEW_BOX}>
          {logoShapes()}
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
