import { cn } from "@/lib/utils";

/**
 * The Mathz mark: four rounded tiles with + (red), − (blue), × (green) and ÷ (yellow) cut out of them, so
 * whatever is behind the mark shows through the symbols. The geometry lives here once and every place that
 * shows the logo draws it from `logoShapes`: the header and splash (`LogoMark`), the favicon (`app/icon.svg`,
 * kept in sync by a test), and the generated app icons (`lib/pwa-icon.tsx`, `app/apple-icon.tsx`). The colours
 * are the brand's own, so the mark looks the same in light and dark mode.
 */

export const LOGO_VIEW_BOX = "0 0 802 742";

export const LOGO_COLORS = { plus: "#ff2424", minus: "#0575ff", times: "#04c45f", divide: "#ffcc00" } as const;

const TILE = { width: 388, height: 360, radius: 80 };

/** A rounded rectangle as a path, so a symbol can be cut out of it in the same element. */
function tilePath(x: number, y: number): string {
  const { width: w, height: h, radius: r } = TILE;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** A circle as a closed subpath. */
const circlePath = (cx: number, cy: number, r: number): string => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

// The symbols, drawn on the same 802 x 742 canvas as the tiles. The outer path of a tile and its symbol are
// filled with the even-odd rule, which turns the symbol into a hole.
const PLUS = "M157 110A34 34 0 0 1 225 110V154H280A34 34 0 0 1 280 222H225V263A34 34 0 0 1 157 263V222H103A34 34 0 0 1 103 154H157Z";
const MINUS = "M513 154H702A34 34 0 0 1 702 222H513A34 34 0 0 1 513 154Z";
const TIMES =
  "M194 517.9L250.18 462.73A34 34 0 0 1 297.82 511.27L242.53 565.5L297.82 619.73A34 34 0 0 1 250.18 668.27L194 613.1L137.82 668.27A34 34 0 0 1 90.18 619.73L145.47 565.5L90.18 511.27A34 34 0 0 1 137.82 462.73Z";
const DIVIDE = `M500 522.5H710A36.5 36.5 0 0 1 710 595.5H500A36.5 36.5 0 0 1 500 522.5Z${circlePath(603, 474, 40)}${circlePath(603, 650, 40)}`;

const TILES = [
  { fill: LOGO_COLORS.plus, x: 0, y: 0, symbol: PLUS },
  { fill: LOGO_COLORS.minus, x: 414, y: 0, symbol: MINUS },
  { fill: LOGO_COLORS.times, x: 0, y: 382, symbol: TIMES },
  { fill: LOGO_COLORS.divide, x: 414, y: 382, symbol: DIVIDE },
] as const;

/**
 * The four tiles as plain `<path>` elements, in reading order, to put inside an `<svg viewBox={LOGO_VIEW_BOX}>`.
 * Call it as a function: image routes (`ImageResponse`) only accept intrinsic SVG elements, not components or
 * fragments. The splash animation (`.splash-logo` in globals.css) relies on this order.
 */
export const logoShapes = () => TILES.map(({ fill, x, y, symbol }) => <path key={fill} d={tilePath(x, y) + symbol} fill={fill} fillRule="evenodd" />);

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW_BOX} aria-hidden className={cn(className)}>
      {logoShapes()}
    </svg>
  );
}
