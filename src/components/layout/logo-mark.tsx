import { cn } from "@/lib/utils";

/**
 * The Mathz mark: four separate, identical rounded tiles in a 2x2 grid, with + (red), − (blue), × (green) and
 * ÷ (yellow) cut out of them, so whatever is behind the mark (the page, or nothing at all) shows through the
 * symbols and through the gaps between the tiles. The geometry lives here once and every place that shows the
 * logo draws it from `logoShapes`: the header and splash (`LogoMark`), the favicon (`app/icon.svg`, kept in
 * sync by a test), and the generated app icons (`lib/pwa-icon.tsx`, `app/apple-icon.tsx`). The colours are the
 * brand's own, so the mark looks the same in light and dark mode. There is no background shape: the mark is
 * transparent apart from the four tiles.
 */

export const LOGO_VIEW_BOX = "0 0 800 800";

export const LOGO_COLORS = { plus: "#ff2424", minus: "#0575ff", times: "#04c45f", divide: "#ffcc00" } as const;

/**
 * Every tile sits in a square cell of its own and keeps `PAD` of clear space on all four sides, so the space
 * around the mark is `PAD` and the space between two neighbouring tiles is `2 * PAD`, the same in both directions.
 */
const CELL = 400;
const PAD = 30;
const TILE = { size: CELL - 2 * PAD, radius: 80 };
const CENTER = TILE.size / 2;

/** A number as it appears in a path: at most two decimals, no trailing zeros. */
const n = (value: number): string => String(Math.round(value * 100) / 100);

/** A rounded square as a path, so a symbol can be cut out of it in the same element. */
function tilePath(x: number, y: number): string {
  const { size: s, radius: r } = TILE;
  return `M${x + r} ${y}H${x + s - r}A${r} ${r} 0 0 1 ${x + s} ${y + r}V${y + s - r}A${r} ${r} 0 0 1 ${x + s - r} ${y + s}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + s - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** A circle as a closed subpath. */
const circlePath = (cx: number, cy: number, r: number): string => `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** A bar with fully rounded ends, `length` long and `thickness` thick, centred on (cx, cy). */
function barPath(cx: number, cy: number, length: number, thickness: number): string {
  const r = thickness / 2;
  const left = cx - length / 2 + r;
  const right = cx + length / 2 - r;
  return `M${n(left)} ${n(cy - r)}H${n(right)}A${r} ${r} 0 0 1 ${n(right)} ${n(cy + r)}H${n(left)}A${r} ${r} 0 0 1 ${n(left)} ${n(cy - r)}Z`;
}

/**
 * A plus with rounded arm ends, `span` across, as one outline, turned by `turn` degrees about its centre (45
 * makes the ×). The outline walks round the twelve corners and each arm end is a half circle of radius `r`.
 */
function crossPath(cx: number, cy: number, span: number, thickness: number, turn = 0): string {
  const r = thickness / 2;
  const reach = span / 2 - r; // centre of an arm's end cap, measured from the middle
  const rad = (turn * Math.PI) / 180;
  const point = (px: number, py: number): string => {
    const dx = px - cx;
    const dy = py - cy;
    return `${n(cx + dx * Math.cos(rad) - dy * Math.sin(rad))} ${n(cy + dx * Math.sin(rad) + dy * Math.cos(rad))}`;
  };
  const arc = `A${r} ${r} 0 0 1 `;
  return [
    `M${point(cx - r, cy - reach)}`, // top arm, left side
    `${arc}${point(cx + r, cy - reach)}`,
    `L${point(cx + r, cy - r)}`,
    `L${point(cx + reach, cy - r)}`, // right arm
    `${arc}${point(cx + reach, cy + r)}`,
    `L${point(cx + r, cy + r)}`,
    `L${point(cx + r, cy + reach)}`, // bottom arm
    `${arc}${point(cx - r, cy + reach)}`,
    `L${point(cx - r, cy + r)}`,
    `L${point(cx - reach, cy + r)}`, // left arm
    `${arc}${point(cx - reach, cy - r)}`,
    `L${point(cx - r, cy - r)}`,
    "Z",
  ].join("");
}

// The symbols, each centred in its tile. The outer path of a tile and its symbol are filled with the even-odd
// rule, which turns the symbol into a hole.
const SYMBOL = 190; // how far across the + − ÷ reach, so they look the same size (× is a little longer: it is turned 45°)
const STROKE = 60;
const DIVIDE_BAR = 52;
const DIVIDE_DOT = { radius: 28, offset: 66 };

type SymbolKind = "plus" | "minus" | "times" | "divide";

/** A tile's symbol, centred on (cx, cy). */
function symbolPath(which: SymbolKind, cx: number, cy: number): string {
  switch (which) {
    case "plus":
      return crossPath(cx, cy, SYMBOL, STROKE);
    case "minus":
      return barPath(cx, cy, SYMBOL, STROKE);
    case "times":
      return crossPath(cx, cy, SYMBOL + 20, STROKE, 45);
    case "divide":
      return barPath(cx, cy, SYMBOL, DIVIDE_BAR) + circlePath(cx, cy - DIVIDE_DOT.offset, DIVIDE_DOT.radius) + circlePath(cx, cy + DIVIDE_DOT.offset, DIVIDE_DOT.radius);
  }
}

const TILES: ReadonlyArray<{ fill: string; symbol: SymbolKind; col: number; row: number }> = [
  { fill: LOGO_COLORS.plus, symbol: "plus", col: 0, row: 0 },
  { fill: LOGO_COLORS.minus, symbol: "minus", col: 1, row: 0 },
  { fill: LOGO_COLORS.times, symbol: "times", col: 0, row: 1 },
  { fill: LOGO_COLORS.divide, symbol: "divide", col: 1, row: 1 },
];

/**
 * The four tiles as plain `<path>` elements, in reading order, to put inside an `<svg viewBox={LOGO_VIEW_BOX}>`.
 * Call it as a function: image routes (`ImageResponse`) only accept intrinsic SVG elements, not components or
 * fragments. The splash animation (`.splash-logo` in globals.css) relies on this order.
 */
export const logoShapes = () =>
  TILES.map(({ fill, symbol, col, row }) => {
    const x = col * CELL + PAD;
    const y = row * CELL + PAD;
    return <path key={fill} d={tilePath(x, y) + symbolPath(symbol, x + CENTER, y + CENTER)} fill={fill} fillRule="evenodd" />;
  });

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEW_BOX} aria-hidden className={cn(className)}>
      {logoShapes()}
    </svg>
  );
}
