import assert from "node:assert/strict";
import { test } from "node:test";
import type { ParsedTopic } from "./model-json.ts";
import { normalizeTopicHierarchy } from "./topic-hierarchy.ts";

const topic = (id: string, parent: string | null, pages: number[] = [1]): ParsedTopic => ({
  id,
  label: id,
  pages,
  parent
});

test("un padre válido se conserva", () => {
  const result = normalizeTopicHierarchy([topic("a", null), topic("b", "a")], 10);
  assert.equal(result.find((t) => t.id === "b")?.parentId, "a");
});

test("una referencia a un padre que no existe se aplana a raíz", () => {
  const result = normalizeTopicHierarchy([topic("b", "fantasma")], 10);
  assert.equal(result[0]?.parentId, null);
});

test("una cadena de tres niveles se aplana a dos: el nieto cuelga de la raíz", () => {
  const result = normalizeTopicHierarchy([topic("a", null), topic("b", "a"), topic("c", "b")], 10);
  assert.equal(result.find((t) => t.id === "b")?.parentId, "a");
  assert.equal(result.find((t) => t.id === "c")?.parentId, "a");
});

test("un ciclo se rompe: ninguno de los dos temas queda con padre", () => {
  const result = normalizeTopicHierarchy([topic("a", "b"), topic("b", "a")], 10);
  assert.equal(result.find((t) => t.id === "a")?.parentId, null);
  assert.equal(result.find((t) => t.id === "b")?.parentId, null);
});

test("un tema que se declara su propio padre queda como raíz", () => {
  const result = normalizeTopicHierarchy([topic("a", "a")], 10);
  assert.equal(result[0]?.parentId, null);
});

test("las páginas fuera de [1, pageCount] se descartan, y los repetidos se colapsan y ordenan", () => {
  const result = normalizeTopicHierarchy([topic("a", null, [3, 0, 99, 3, 1, -2])], 10);
  assert.deepEqual([...result[0]!.pages], [1, 3]);
});

test("un tema que se queda sin ninguna página válida se descarta entero", () => {
  const result = normalizeTopicHierarchy([topic("a", null, [1]), topic("b", null, [50, 60])], 10);
  assert.deepEqual(result.map((t) => t.id), ["a"]);
});
