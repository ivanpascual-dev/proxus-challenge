import assert from "node:assert/strict";
import { test } from "node:test";
import { describeActivityCall, turnActivityVerb } from "./activity-labels.ts";

test("describeActivityCall: load_skill usa el nombre humano de la skill", () => {
  assert.equal(describeActivityCall("load_skill", { name: "use-uploaded-materials" }), "Consultando el material");
  assert.equal(describeActivityCall("load_skill", { name: "review-progress" }), "Revisando tu progreso");
});

test("describeActivityCall: una skill que no está en la tabla cae al fallback, no revienta", () => {
  assert.equal(describeActivityCall("load_skill", { name: "skill-nueva-sin-etiqueta" }), "Ejecutando una acción");
});

test("describeActivityCall: cli se etiqueta por el prefijo real del comando, nunca por el nombre técnico", () => {
  assert.equal(describeActivityCall("cli", { input: "materials read \"m1\" 1-10" }), "Leyendo el material");
  assert.equal(describeActivityCall("cli", { input: "materials view \"m1\" 3" }), "Viendo páginas del material");
  assert.equal(describeActivityCall("cli", { input: "artifacts note propose \"a1\" b1" }), "Preparando una propuesta de apunte");
  assert.equal(describeActivityCall("cli", { input: "profile show \"m1\"" }), "Consultando tu progreso");
});

test("describeActivityCall: un comando desconocido o input inesperado cae al fallback", () => {
  assert.equal(describeActivityCall("cli", { input: "comando-inexistente" }), "Ejecutando una acción");
  assert.equal(describeActivityCall("cli", {}), "Ejecutando una acción");
  assert.equal(describeActivityCall("otra-herramienta", { anything: true }), "Ejecutando una acción");
});

test("turnActivityVerb: las tres frases exactas de la decisión 23, nada más", () => {
  assert.equal(turnActivityVerb({ callCount: 0, failed: false }), "Preparando una respuesta");
  assert.equal(turnActivityVerb({ callCount: 3, failed: false }), "Consultando el material");
  assert.equal(turnActivityVerb({ callCount: 3, failed: true }), "No se pudo completar una acción");
  assert.equal(turnActivityVerb({ callCount: 0, failed: true }), "No se pudo completar una acción");
});
