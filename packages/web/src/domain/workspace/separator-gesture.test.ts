import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSeparatorGesture, SEPARATOR_DRAG_THRESHOLD_PX } from "./separator-gesture.ts";

test("un puntero que no se mueve es una pulsación", () => {
  assert.equal(resolveSeparatorGesture(600, 600), "toggle");
});

test("justo por debajo del umbral sigue siendo pulsación, y en el umbral ya es arrastre", () => {
  assert.equal(resolveSeparatorGesture(600, 600 + SEPARATOR_DRAG_THRESHOLD_PX - 0.1), "toggle");
  assert.equal(resolveSeparatorGesture(600, 600 + SEPARATOR_DRAG_THRESHOLD_PX), "drag");
  assert.equal(resolveSeparatorGesture(600, 640), "drag");
});

test("el sentido del desplazamiento no importa: cuenta la distancia recorrida", () => {
  assert.equal(resolveSeparatorGesture(600, 597), "toggle");
  assert.equal(resolveSeparatorGesture(600, 560), "drag");
});

test("el umbral se puede subir sin tocar el resto del gesto", () => {
  assert.equal(resolveSeparatorGesture(600, 606, 8), "toggle");
  assert.equal(resolveSeparatorGesture(600, 606), "drag");
});

test("una coordenada no finita se resuelve como arrastre, nunca como plegado accidental", () => {
  assert.equal(resolveSeparatorGesture(Number.NaN, 600), "drag");
  assert.equal(resolveSeparatorGesture(600, Number.POSITIVE_INFINITY), "drag");
});
