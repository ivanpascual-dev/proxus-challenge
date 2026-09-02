import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import { validateQueueAddition } from "./upload-queue.ts";

test("un lote que cabe y no repite nombres se acepta sin razones de rechazo", () => {
  const reasons = validateQueueAddition({
    existingMaterials: 2,
    stagedNames: ["a.pdf"],
    incomingNames: ["b.pdf"]
  });

  assert.deepEqual(reasons, []);
});

test("dos selecciones que juntas superan el techo de maxMaterials se rechazan enteras", () => {
  const reasons = validateQueueAddition({
    existingMaterials: 0,
    stagedNames: ["a.pdf", "b.pdf", "c.pdf"],
    incomingNames: ["d.pdf", "e.pdf", "f.pdf"]
  });

  assert.deepEqual(reasons, [{
    type: "not-enough-material-slots",
    received: 3,
    staged: 3,
    existingMaterials: 0,
    ceiling: LIMITS.maxMaterials
  }]);
});

test("un nombre repetido entre lotes se rechaza aunque quepa en el techo", () => {
  const reasons = validateQueueAddition({
    existingMaterials: 0,
    stagedNames: ["a.pdf"],
    incomingNames: ["a.pdf", "b.pdf"]
  });

  assert.deepEqual(reasons, [{ type: "duplicate-name", fileName: "a.pdf" }]);
});

test("las plazas insuficientes cuentan también los materiales ya existentes en el servidor", () => {
  const reasons = validateQueueAddition({
    existingMaterials: 4,
    stagedNames: [],
    incomingNames: ["a.pdf", "b.pdf"]
  });

  assert.deepEqual(reasons, [{
    type: "not-enough-material-slots",
    received: 2,
    staged: 0,
    existingMaterials: 4,
    ceiling: LIMITS.maxMaterials
  }]);
});

test("el lote nuevo no muta la cola: llamar dos veces con el mismo input da el mismo resultado", () => {
  const stagedNames = ["a.pdf", "b.pdf", "c.pdf"];
  const incomingNames = ["d.pdf", "e.pdf", "f.pdf"];

  validateQueueAddition({ existingMaterials: 0, stagedNames, incomingNames });

  assert.deepEqual(stagedNames, ["a.pdf", "b.pdf", "c.pdf"]);
  assert.deepEqual(incomingNames, ["d.pdf", "e.pdf", "f.pdf"]);
});
