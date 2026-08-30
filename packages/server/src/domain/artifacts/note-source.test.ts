import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS, type IndexedPage, type MaterialIndex } from "@proxus/shared";
import { buildMaterialExcerpt } from "./note-source.ts";

const page = (over: Partial<IndexedPage> & { readonly page: number }): IndexedPage => ({
  provenance: "extracted",
  text: `texto de la página ${over.page}`,
  denseCharacters: 100,
  topicIds: [],
  ...over
});

const index = (over: Partial<MaterialIndex> = {}): MaterialIndex => ({
  contentHash: "hash",
  pageCount: 10,
  indexedAt: "2026-08-29T00:00:00.000Z",
  threshold: 600,
  topics: [],
  pages: [page({ page: 3 }), page({ page: 4 })],
  failedPages: [],
  materialId: "conjuntos",
  fileName: "conjuntos.pdf",
  ...over
});

test("páginas indexadas, texto por debajo del techo: fragmento entero, sin recorte, sin motivo", () => {
  const result = buildMaterialExcerpt(index(), [3, 4]);
  assert.equal(result.unanchoredReason, null);
  assert.equal(result.excerptTruncated, false);
  assert.equal(result.transcribed, false);
  assert.match(result.excerpt ?? "", /página 3/);
  assert.match(result.excerpt ?? "", /página 4/);
});

test("alguna página citada es transcripción del modelo: se marca", () => {
  const result = buildMaterialExcerpt(
    index({ pages: [page({ page: 3, provenance: "transcribed" }), page({ page: 4 })] }),
    [3, 4]
  );
  assert.equal(result.transcribed, true);
  assert.equal(result.unanchoredReason, null);
});

test("texto por encima de maxSourceExcerptCharacters: se recorta y se dice", () => {
  const huge = "x".repeat(LIMITS.maxSourceExcerptCharacters + 500);
  const result = buildMaterialExcerpt(index({ pages: [page({ page: 3, text: huge })] }), [3]);
  assert.equal(result.excerptTruncated, true);
  assert.equal((result.excerpt ?? "").length, LIMITS.maxSourceExcerptCharacters);
});

test("página fuera de [1, pageCount]: no ancla, motivo con las páginas del material", () => {
  const result = buildMaterialExcerpt(index({ pageCount: 5 }), [7]);
  assert.equal(result.excerpt, null);
  assert.equal(result.excerptTruncated, false);
  assert.match(result.unanchoredReason ?? "", /tiene 5 páginas.*se citó la 7/);
});

test("página en failedPages: no ancla, motivo con el reason del índice", () => {
  const result = buildMaterialExcerpt(
    index({ failedPages: [{ page: 3, reason: "la transcripción no se pudo parsear" }] }),
    [3]
  );
  assert.equal(result.excerpt, null);
  assert.match(result.unanchoredReason ?? "", /página 3 no se pudo indexar.*no se pudo parsear/);
});

test("pages vacío: no ancla, motivo de cita sin páginas", () => {
  const result = buildMaterialExcerpt(index(), []);
  assert.equal(result.excerpt, null);
  assert.match(result.unanchoredReason ?? "", /no dice de qué páginas sale/);
});
