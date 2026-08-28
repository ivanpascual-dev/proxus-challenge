import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { classifyPage } from "./page-classifier.ts";

// El fixture sintético versionado. Se regenera con `node packages/server/fixtures/make-fixture.mjs`.
const fixturePath = fileURLToPath(new URL("../../../fixtures/materials/densidad.pdf", import.meta.url));

const extract = (page: number) =>
  execFileSync("pdftotext", ["-f", String(page), "-l", String(page), fixturePath, "-"], { encoding: "utf8" });

// Página -> camino esperado, según la tabla del plan (sección 4.16).
const expected: Record<number, "extracted" | "transcribed"> = {
  1: "transcribed", // portada, ~26 caracteres no blancos
  2: "extracted", // texto corrido, ~2400
  3: "transcribed", // texto escaso, ~200
  4: "extracted" // ~610, justo por encima del umbral de 600
};

for (const [page, path] of Object.entries(expected)) {
  test(`densidad.pdf página ${page} se clasifica como ${path}`, () => {
    assert.equal(classifyPage(extract(Number(page))), path);
  });
}
