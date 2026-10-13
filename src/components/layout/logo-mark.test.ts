import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOGO_COLORS, LOGO_VIEW_BOX, LogoMark, logoShapes } from "./logo-mark";

/** The favicon is a static file (Next serves `app/icon.svg` as is), so it is a copy of the shared shapes. */
const faviconMarkup = () => renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: LOGO_VIEW_BOX }, logoShapes()));

describe("logo", () => {
  it("draws four tiles in the brand colours, in reading order", () => {
    const svg = renderToStaticMarkup(createElement(LogoMark));
    const fills = [...svg.matchAll(/<path[^>]*fill="(#[0-9a-f]+)"/g)].map((m) => m[1]);
    assert.deepEqual(fills, [LOGO_COLORS.plus, LOGO_COLORS.minus, LOGO_COLORS.times, LOGO_COLORS.divide]);
  });

  it("cuts the symbols out of the tiles instead of painting them", () => {
    const svg = renderToStaticMarkup(createElement(LogoMark));
    assert.equal(svg.match(/fill-rule="evenodd"/g)?.length, 4);
    // Nothing is drawn white, and each tile is one path holding the tile outline plus its symbol.
    assert.doesNotMatch(svg, /#fff/i);
    for (const [, d] of svg.matchAll(/<path d="([^"]+)"/g)) assert.ok((d.match(/M/g) ?? []).length >= 2, "tile outline and symbol");
  });

  it("keeps four identical tiles in a 2x2 grid with equal padding and clear gaps", () => {
    const svg = renderToStaticMarkup(createElement(LogoMark));
    // The first subpath of every tile is its outline: M (x+r) y H ... so x and y give the tile's top-left corner.
    const tiles = [...svg.matchAll(/<path d="M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)H(\d+(?:\.\d+)?)A80 80 0 0 1 (\d+(?:\.\d+)?) /g)].map((m) => ({
      left: Number(m[1]) - 80,
      top: Number(m[2]),
      right: Number(m[4]),
    }));
    assert.equal(tiles.length, 4);
    const size = tiles[0].right - tiles[0].left;
    for (const t of tiles) assert.equal(t.right - t.left, size, "every tile is the same width");
    const [plus, minus, times, divide] = tiles;
    assert.equal(plus.top, minus.top);
    assert.equal(times.top, divide.top);
    assert.equal(plus.left, times.left);
    assert.equal(minus.left, divide.left);

    const [, , width, height] = LOGO_VIEW_BOX.split(" ").map(Number);
    const pad = plus.left;
    const horizontalGap = minus.left - (plus.left + size);
    const verticalGap = times.top - (plus.top + size);
    assert.ok(pad > 0, "space around the whole mark");
    assert.equal(plus.top, pad, "same space above as at the left");
    assert.equal(width - (minus.left + size), pad, "same space at the right");
    assert.equal(height - (times.top + size), pad, "same space at the bottom");
    assert.equal(horizontalGap, verticalGap, "the same gap between columns as between rows");
    assert.ok(horizontalGap >= 2 * pad, "each tile keeps its own padding, so the gap is twice the outer space");
    assert.equal(width, height, "a square canvas");
  });

  it("has a transparent background: nothing is drawn except the four tiles", () => {
    const svg = renderToStaticMarkup(createElement(LogoMark));
    assert.equal(svg.match(/<(rect|circle|ellipse|polygon|image|use)\b/g), null);
    assert.equal(svg.match(/<path\b/g)?.length, 4);
    assert.doesNotMatch(svg, /background|<style|opacity/i);
  });

  it("is hidden from assistive technology (the name sits beside it)", () => {
    assert.match(renderToStaticMarkup(createElement(LogoMark)), /aria-hidden="true"/);
  });

  it("keeps src/app/icon.svg identical to the shared shapes", () => {
    const file = readFileSync(join(process.cwd(), "src", "app", "icon.svg"), "utf8").trim();
    assert.equal(file, faviconMarkup());
  });
});
