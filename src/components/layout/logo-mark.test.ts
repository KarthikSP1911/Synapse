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

  it("is hidden from assistive technology (the name sits beside it)", () => {
    assert.match(renderToStaticMarkup(createElement(LogoMark)), /aria-hidden="true"/);
  });

  it("keeps src/app/icon.svg identical to the shared shapes", () => {
    const file = readFileSync(join(process.cwd(), "src", "app", "icon.svg"), "utf8").trim();
    assert.equal(file, faviconMarkup());
  });
});
