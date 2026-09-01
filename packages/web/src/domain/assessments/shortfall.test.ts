import assert from "node:assert/strict";
import { test } from "node:test";
import { partialAssessmentNotice } from "./shortfall.ts";

test("solicitado igual a generado: sin aviso", () => {
  assert.equal(partialAssessmentNotice(6, 6), null);
});

test("solicitado mayor que generado: el aviso literal con los dos números", () => {
  assert.equal(partialAssessmentNotice(20, 13), "Se pidieron 20 preguntas; el contenido permitió 13.");
});
