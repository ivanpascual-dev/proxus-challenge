import assert from "node:assert/strict";
import { test } from "node:test";
import type { IndexedPage, MaterialTopic } from "@proxus/shared";
import { denseSourceCharacters, pruneUnsupportedTopics } from "./topic-support.ts";

const page = (n: number, text: string): IndexedPage => ({
  page: n,
  provenance: "extracted",
  text,
  denseCharacters: text.replace(/\s/g, "").length,
  topicIds: []
});

const topic = (id: string, pages: number[], parentId: string | null = null, label = id): MaterialTopic => ({
  id,
  label,
  pages,
  parentId
});

const dense = (n: number): string => "x".repeat(n);

test("denseSourceCharacters cuenta caracteres no blancos, sin contar dos veces una página repetida", () => {
  const pages = [page(1, dense(30)), page(2, dense(20))];
  assert.equal(denseSourceCharacters(topic("t", [1, 1, 2]), pages), 50);
});

test("tema suficiente: sobrevive con su respaldo propio", () => {
  const pages = [page(1, dense(100))];
  const topics = [topic("t", [1])];
  assert.deepEqual(pruneUnsupportedTopics(topics, pages, 60).map((t) => t.id), ["t"]);
});

test("hoja pobre: se elimina, y su página queda sin ningún tema que la reclame", () => {
  const pages = [page(1, dense(10))];
  const topics = [topic("portada", [1])];
  assert.deepEqual(pruneUnsupportedTopics(topics, pages, 60), []);
});

test("padre huérfano: se elimina si su único hijo también queda por debajo del mínimo", () => {
  const pages = [page(1, dense(10)), page(2, dense(5))];
  const topics = [topic("area", [1, 2]), topic("subtema", [2], "area")];
  assert.deepEqual(pruneUnsupportedTopics(topics, pages, 60), []);
});

test("padre con un hijo suficiente sobrevive aunque el padre no tenga respaldo propio", () => {
  const pages = [page(1, dense(5)), page(2, dense(100))];
  const topics = [topic("area", [1], null, "Área"), topic("hoja", [2], "area", "Hoja")];
  const result = pruneUnsupportedTopics(topics, pages, 60);
  assert.deepEqual(result.map((t) => t.id), ["area", "hoja"]);
  assert.equal(result.find((t) => t.id === "hoja")?.parentId, "area");
});

test("material sin ningún tema: la lista vacía se conserva vacía", () => {
  assert.deepEqual(pruneUnsupportedTopics([], [], 60), []);
});

test("conserva el orden original de los supervivientes", () => {
  const pages = [page(1, dense(100)), page(2, dense(10)), page(3, dense(100))];
  const topics = [topic("a", [1]), topic("pobre", [2]), topic("b", [3])];
  assert.deepEqual(pruneUnsupportedTopics(topics, pages, 60).map((t) => t.id), ["a", "b"]);
});
