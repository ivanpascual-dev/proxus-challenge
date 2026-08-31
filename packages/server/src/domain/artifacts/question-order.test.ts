import assert from "node:assert/strict";
import { test } from "node:test";
import { shuffleBySeed } from "./question-order.ts";

const grouped = [
  "mc-1", "mc-2", "mc-3", "mc-4",
  "tf-1", "tf-2",
  "sa-1", "sa-2"
];

test("la misma semilla da siempre el mismo orden", () => {
  assert.deepEqual(shuffleBySeed(grouped, "abc-123"), shuffleBySeed(grouped, "abc-123"));
});

test("la salida es una permutación de la entrada, sin perder ni repetir nada", () => {
  const out = shuffleBySeed(grouped, "otra-prueba");
  assert.deepEqual([...out].sort(), [...grouped].sort());
});

test("baraja de verdad: no devuelve la entrada agrupada tal cual", () => {
  // Con estas dos semillas el orden cambia; el objetivo es que el tipo no marque la posición.
  assert.notDeepEqual(shuffleBySeed(grouped, "prueba-1"), grouped);
  assert.notDeepEqual(shuffleBySeed(grouped, "prueba-2"), grouped);
});

test("semillas distintas dan órdenes distintos", () => {
  assert.notDeepEqual(shuffleBySeed(grouped, "prueba-1"), shuffleBySeed(grouped, "prueba-2"));
});

test("no rompe con listas de cero o un elemento", () => {
  assert.deepEqual(shuffleBySeed([], "x"), []);
  assert.deepEqual(shuffleBySeed(["solo"], "x"), ["solo"]);
});
