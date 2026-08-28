import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import { classifyPage, countDenseCharacters } from "./page-classifier.ts";

test("countDenseCharacters ignores whitespace", () => {
  assert.equal(countDenseCharacters("  a b\n c\t "), 3);
});

test("classifyPage keeps a page one character below the threshold as transcribed", () => {
  const text = "a".repeat(LIMITS.textDensityThreshold - 1);
  assert.equal(classifyPage(text), "transcribed");
});

test("classifyPage treats a page exactly at the threshold as extracted", () => {
  const text = "a".repeat(LIMITS.textDensityThreshold);
  assert.equal(classifyPage(text), "extracted");
});

test("classifyPage counts only dense characters, not raw length", () => {
  // 601 caracteres en total pero solo 599 no blancos: sigue siendo transcribed.
  const text = `${"a".repeat(LIMITS.textDensityThreshold - 1)}  `;
  assert.equal(text.length, LIMITS.textDensityThreshold + 1);
  assert.equal(classifyPage(text), "transcribed");
});
