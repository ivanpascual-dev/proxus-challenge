import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSourcePages, pageRanges } from "./sources.ts";

test("una sola página se escribe en singular", () => {
  assert.equal(formatSourcePages([7]), "página 7");
});

test("páginas sueltas se separan por comas", () => {
  assert.equal(formatSourcePages([3, 9]), "páginas 3, 9");
});

test("un tramo contiguo se agrupa en un rango", () => {
  assert.equal(formatSourcePages([4, 5, 6, 7]), "páginas 4-7");
});

test("tramos y sueltas conviven en el mismo texto", () => {
  assert.deepEqual(pageRanges([1, 2, 3, 8, 11, 12]), ["1-3", "8", "11-12"]);
});

test("desordenadas o repetidas se normalizan antes de agrupar", () => {
  assert.deepEqual(pageRanges([5, 3, 4, 5]), ["3-5"]);
});

test("sin páginas no hay texto que enseñar", () => {
  assert.equal(formatSourcePages([]), "");
  assert.deepEqual(pageRanges([]), []);
});
