import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import { renderDpi } from "./render-scale.ts";

const shortSidePixels = (points: number) => Math.round((renderDpi(points) * points) / 72);

test("renderDpi maps a 16:9 slide short side (1080 pt) to about 77 dpi", () => {
  assert.equal(renderDpi(1080), 77);
});

test("renderDpi maps an A4 short side (595 pt) to about 139 dpi", () => {
  assert.equal(renderDpi(595), 139);
});

test("renderDpi lands the short side near 1152 px for both page shapes", () => {
  // El dpi entero no cae exacto; poppler acierta 1152 usando -scale-to, no -r (ver paso 16).
  // Aquí basta con que la aproximación por dpi quede dentro del error de redondeo.
  for (const points of [1080, 595]) {
    const pixels = shortSidePixels(points);
    assert.ok(
      Math.abs(pixels - LIMITS.renderShortSidePixels) <= 4,
      `expected ~${LIMITS.renderShortSidePixels} px for ${points} pt, got ${pixels}`
    );
  }
});
