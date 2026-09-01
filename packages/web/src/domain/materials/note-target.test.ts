import assert from "node:assert/strict";
import { test } from "node:test";
import type { MaterialBlockSource, NoteBlock, UrlBlockSource } from "@proxus/shared";
import { findBlockForTopic } from "./note-target.ts";

const materialSource = (materialId: string, pages: readonly number[]): MaterialBlockSource => ({
  type: "material",
  materialId,
  pages,
  excerpt: "texto",
  excerptTruncated: false,
  transcribed: false,
  unanchoredReason: null
});

const urlSource: UrlBlockSource = {
  type: "url",
  url: "https://example.com",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  title: "Fuente externa",
  excerpt: "texto",
  excerptTruncated: false
};

const block = (id: string, source: NoteBlock["source"]): NoteBlock => ({
  id,
  markdown: `bloque ${id}`,
  author: "student",
  emphasis: false,
  source
});

test("sin bloques no hay ninguno que vincular", () => {
  assert.equal(findBlockForTopic([], "m1", [1, 2, 3]), null);
});

test("un bloque de otro material nunca se elige, aunque sus páginas coincidan", () => {
  const blocks = [block("b1", materialSource("otro-material", [1, 2, 3]))];
  assert.equal(findBlockForTopic(blocks, "m1", [1, 2, 3]), null);
});

test("un bloque con fuente URL se ignora: no tiene páginas de material que solapar", () => {
  const blocks = [block("b1", urlSource)];
  assert.equal(findBlockForTopic(blocks, "m1", [1, 2, 3]), null);
});

test("una única coincidencia con solape gana", () => {
  const blocks = [
    block("b1", materialSource("m1", [10, 11])),
    block("b2", materialSource("m1", [1, 2, 3]))
  ];
  assert.equal(findBlockForTopic(blocks, "m1", [2, 3, 4]), "b2");
});

test("gana el bloque con mayor número de páginas en común, no el primero", () => {
  const blocks = [
    block("b1", materialSource("m1", [1])),
    block("b2", materialSource("m1", [1, 2, 3]))
  ];
  assert.equal(findBlockForTopic(blocks, "m1", [1, 2, 3, 4]), "b2");
});

test("un empate en el solape lo gana el bloque que aparece antes en el apunte", () => {
  const blocks = [
    block("b1", materialSource("m1", [1, 2])),
    block("b2", materialSource("m1", [1, 2]))
  ];
  assert.equal(findBlockForTopic(blocks, "m1", [1, 2, 3]), "b1");
});

test("cero páginas en común con cualquier bloque devuelve null, sin inventar una relación", () => {
  const blocks = [
    block("b1", materialSource("m1", [10, 11])),
    block("b2", materialSource("m1", [20, 21]))
  ];
  assert.equal(findBlockForTopic(blocks, "m1", [1, 2, 3]), null);
});
