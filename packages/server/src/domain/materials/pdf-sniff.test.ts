import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { looksLikePdf } from "./pdf-sniff.ts";

const fixturePdf = fileURLToPath(new URL("../../../fixtures/materials/densidad.pdf", import.meta.url));

test("looksLikePdf acepta un PDF real", () => {
  const bytes = readFileSync(fixturePdf);
  assert.equal(looksLikePdf(bytes), true);
});

test("looksLikePdf rechaza un PNG", () => {
  const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(looksLikePdf(pngMagic), false);
});

test("looksLikePdf rechaza un fichero vacío", () => {
  assert.equal(looksLikePdf(new Uint8Array(0)), false);
});

test("looksLikePdf acepta un .txt que empieza por la cabecera de un PDF", () => {
  // El sniff no distingue esto de un PDF real: es `pdfinfo`, después, quien lo tumba (test del
  // camino completo en el servicio de subida).
  const bytes = new TextEncoder().encode("%PDF-1.4\nesto no es un PDF de verdad");
  assert.equal(looksLikePdf(bytes), true);
});
