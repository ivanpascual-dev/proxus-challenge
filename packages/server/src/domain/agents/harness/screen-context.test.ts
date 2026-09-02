import assert from "node:assert/strict";
import { test } from "node:test";
import { renderScreenContext } from "./screen-context.ts";

test("renderScreenContext: sin referencias no hay bloque", () => {
  assert.equal(renderScreenContext([]), undefined);
});

test("renderScreenContext: una referencia de material nombra el título y el id, nunca su contenido", () => {
  const block = renderScreenContext([
    { kind: "material", materialId: "algebra-notes", title: "Algebra notes", surface: "pdf" }
  ]);

  assert.match(block ?? "", /<<<BEGIN SCREEN CONTEXT>>>/);
  assert.match(block ?? "", /<<<END SCREEN CONTEXT>>>/);
  assert.match(block ?? "", /material "Algebra notes" \(id: algebra-notes\)/);
  assert.match(block ?? "", /pointers, not content/);
});

// Fase 5, §5.2 y §6.3: la superficie se traduce al vocabulario visible de las cuatro pestañas, para
// que Sym pueda decir en qué zona está el estudiante sin deducirla de que exista o no un artefacto.
test("renderScreenContext: la superficie se dice con el nombre de la pestaña", () => {
  const surfaces = [
    { surface: "pdf", label: "PDF" },
    { surface: "mindmap", label: "Mapa" },
    { surface: "notes", label: "Apuntes" },
    { surface: "assessments", label: "Pruebas" }
  ] as const;

  for (const { surface, label } of surfaces) {
    const block = renderScreenContext([
      { kind: "material", materialId: "m1", title: "Cálculo I", surface }
    ]) ?? "";
    assert.ok(block.includes(`on the "${label}" tab`), `${surface} debería decir ${label}: ${block}`);
  }
});

// Un turno guardado antes de fase 5 no tiene superficie: se describe el material y no se afirma
// pestaña ninguna (invariante 3: no se rellena con la más probable).
test("renderScreenContext: sin superficie no se inventa pestaña", () => {
  const block = renderScreenContext([
    { kind: "material", materialId: "m1", title: "Cálculo I", surface: undefined }
  ]) ?? "";

  assert.match(block, /material "Cálculo I" \(id: m1\)/);
  assert.ok(!block.includes("tab"), block);
});

// El tipo de prueba lo trae ya resuelto el servidor (`screen-context-resolver.ts`), y la vista
// distingue resolver de mirar el historial (F5-44).
test("renderScreenContext: la prueba abierta dice qué es y qué vista se mira", () => {
  const solving = renderScreenContext([
    { kind: "assessment", artifactId: "a1", title: "Examen final", assessment: "Control", view: "solve" }
  ]) ?? "";
  const history = renderScreenContext([
    { kind: "assessment", artifactId: "a2", title: "Repaso", assessment: "Examen de prueba", view: "history" }
  ]) ?? "";

  assert.match(solving, /Control "Examen final" \(id: a1\), open in its solver/);
  assert.match(history, /Examen de prueba "Repaso" \(id: a2\), open in its attempt history/);
});

test("renderScreenContext: la página adjunta nombra número y material, nunca su texto", () => {
  const block = renderScreenContext([
    { kind: "page", materialId: "calculo", materialTitle: "Cálculo I", page: 7 }
  ]) ?? "";

  assert.match(block, /page 7 of material "Cálculo I" \(id: calculo\)/);
});

test("renderScreenContext: varias referencias se listan todas, en orden", () => {
  const block = renderScreenContext([
    { kind: "material", materialId: "m1", title: "Algebra notes", surface: "notes" },
    { kind: "note", artifactId: "a1", title: "Apuntes de álgebra" },
    { kind: "block", artifactId: "a1", blockId: "b1", title: "Definición de grupo" }
  ]) ?? "";

  const materialIndex = block.indexOf("material \"Algebra notes\"");
  const noteIndex = block.indexOf("note \"Apuntes de álgebra\"");
  const blockIndex = block.indexOf("block \"Definición de grupo\"");

  assert.ok(materialIndex >= 0 && noteIndex > materialIndex && blockIndex > noteIndex);
});
