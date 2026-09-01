import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampMaterialRatio,
  decodeStoredLayout,
  DEFAULT_MATERIAL_RATIO,
  encodeLayoutForStorage,
  ratioFromPointer,
  type SplitBounds
} from "./layout.ts";

const bounds = (availableWidth: number): SplitBounds => ({
  availableWidth,
  minMaterialWidth: 420,
  minChatWidth: 420
});

test("un valor ausente o roto decodifica al modo chat y al ratio por defecto", () => {
  assert.deepEqual(decodeStoredLayout(null), { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO });
  assert.deepEqual(decodeStoredLayout("no es json"), { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO });
  assert.deepEqual(decodeStoredLayout("{}"), { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO });
  assert.deepEqual(
    decodeStoredLayout(JSON.stringify({ materialRatio: "0.5" })),
    { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO }
  );
  assert.deepEqual(
    decodeStoredLayout(JSON.stringify({ materialRatio: Number.NaN })),
    { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO }
  );
});

test("clampMaterialRatio acota en ambos extremos a los mínimos de cada panel", () => {
  const wide = bounds(2000);
  assert.equal(clampMaterialRatio(0, wide), 420 / 2000);
  assert.equal(clampMaterialRatio(1, wide), 1 - 420 / 2000);
  assert.equal(clampMaterialRatio(DEFAULT_MATERIAL_RATIO, wide), DEFAULT_MATERIAL_RATIO);
});

test("con la anchura justa para los dos mínimos, cualquier ratio pedido cae en el único punto posible", () => {
  const exact = bounds(840);
  assert.equal(clampMaterialRatio(0.5, exact), 0.5);
  assert.equal(clampMaterialRatio(0.1, exact), 0.5);
  assert.equal(clampMaterialRatio(0.9, exact), 0.5);
});

test("con anchura insuficiente para los dos mínimos, no rompe: acota a [0, 1] en vez de devolver NaN o negativo", () => {
  const tooNarrow = bounds(400);
  assert.equal(clampMaterialRatio(0.58, tooNarrow), 0.58);
  assert.equal(clampMaterialRatio(-3, tooNarrow), 0);
  assert.equal(clampMaterialRatio(9, tooNarrow), 1);
});

test("ratioFromPointer traduce la posición del cursor y respeta los mismos mínimos", () => {
  const wide = bounds(2000);
  assert.equal(ratioFromPointer(1000, 0, wide), 0.5);
  assert.equal(ratioFromPointer(-500, 0, wide), 420 / 2000);
  assert.equal(ratioFromPointer(5000, 0, wide), 1 - 420 / 2000);
});

test("persistir y volver a decodificar conserva el ratio guardado (roundtrip)", () => {
  const layout = { mode: "split" as const, materialRatio: 0.63 };
  const stored = encodeLayoutForStorage(layout);
  assert.deepEqual(decodeStoredLayout(stored), { mode: "chat", materialRatio: 0.63 });
});
