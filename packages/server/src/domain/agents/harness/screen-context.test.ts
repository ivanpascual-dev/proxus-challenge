import assert from "node:assert/strict";
import { test } from "node:test";
import { renderScreenContext } from "./screen-context.ts";

test("renderScreenContext: sin referencias no hay bloque", () => {
  assert.equal(renderScreenContext([]), undefined);
});

test("renderScreenContext: una referencia de material nombra el título y el id, nunca su contenido", () => {
  const block = renderScreenContext([
    { type: "material", materialId: "algebra-notes", title: "Algebra notes" }
  ]);

  assert.match(block ?? "", /<<<BEGIN SCREEN CONTEXT>>>/);
  assert.match(block ?? "", /<<<END SCREEN CONTEXT>>>/);
  assert.match(block ?? "", /material "Algebra notes" \(id: algebra-notes\)/);
  assert.match(block ?? "", /pointers, not content/);
});

test("renderScreenContext: varias referencias se listan todas, en orden", () => {
  const block = renderScreenContext([
    { type: "material", materialId: "m1", title: "Algebra notes" },
    { type: "artifact", artifactId: "a1", title: "Control de grupos" },
    { type: "block", artifactId: "a2", blockId: "b1", title: "Definición de grupo" }
  ]) ?? "";

  const materialIndex = block.indexOf("material \"Algebra notes\"");
  const artifactIndex = block.indexOf("artifact \"Control de grupos\"");
  const blockIndex = block.indexOf("block \"Definición de grupo\"");

  assert.ok(materialIndex >= 0 && artifactIndex > materialIndex && blockIndex > artifactIndex);
});
