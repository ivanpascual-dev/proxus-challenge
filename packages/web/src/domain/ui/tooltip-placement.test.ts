import assert from "node:assert/strict";
import { test } from "node:test";
import { placeTooltip, type Rect, type Size } from "./tooltip-placement.ts";

const viewport: Size = { width: 1000, height: 800 };
const bubble: Size = { width: 120, height: 40 };

test("centrado sobre el control y colocado arriba cuando hay sitio", () => {
  const trigger: Rect = { top: 400, left: 300, width: 40, height: 20 };
  const placed = placeTooltip(trigger, bubble, viewport);
  assert.equal(placed.side, "top");
  assert.equal(placed.top, 400 - 6 - 40);
  assert.equal(placed.left, 300 + 20 - 60);
});

test("esquina superior izquierda: voltea abajo y se pega al margen izquierdo", () => {
  const trigger: Rect = { top: 4, left: 2, width: 24, height: 24 };
  const placed = placeTooltip(trigger, bubble, viewport);
  assert.equal(placed.side, "bottom");
  assert.equal(placed.top, 4 + 24 + 6);
  assert.equal(placed.left, 8);
});

test("esquina superior derecha: abajo y recortado al margen derecho", () => {
  const trigger: Rect = { top: 2, left: 980, width: 20, height: 20 };
  const placed = placeTooltip(trigger, bubble, viewport);
  assert.equal(placed.side, "bottom");
  assert.equal(placed.left, 1000 - 8 - 120);
});

test("esquina inferior izquierda: cabe arriba y se pega al margen izquierdo", () => {
  const trigger: Rect = { top: 780, left: 4, width: 20, height: 18 };
  const placed = placeTooltip(trigger, bubble, viewport);
  assert.equal(placed.side, "top");
  assert.equal(placed.top, 780 - 6 - 40);
  assert.equal(placed.left, 8);
});

test("esquina inferior derecha: arriba y recortado al margen derecho e inferior", () => {
  const trigger: Rect = { top: 790, left: 985, width: 15, height: 10 };
  const placed = placeTooltip(trigger, bubble, viewport);
  assert.equal(placed.side, "top");
  assert.equal(placed.left, 1000 - 8 - 120);
  assert.ok(placed.top <= 800 - 8 - 40);
});

test("un tooltip más ancho que el viewport útil se pega al margen izquierdo, no se sale por la derecha", () => {
  const wide: Size = { width: 2000, height: 40 };
  const trigger: Rect = { top: 400, left: 500, width: 20, height: 20 };
  const placed = placeTooltip(trigger, wide, viewport);
  assert.equal(placed.left, 8);
});

test("un control dentro de un panel con scroll, con el trigger fuera del viewport por arriba, cae debajo y dentro del margen", () => {
  const trigger: Rect = { top: -50, left: 400, width: 30, height: 20 };
  const placed = placeTooltip(trigger, bubble, viewport);
  assert.equal(placed.side, "bottom");
  assert.ok(placed.top >= 8);
  assert.ok(placed.top <= 800 - 8 - 40);
});
