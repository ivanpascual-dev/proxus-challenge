import assert from "node:assert/strict";
import { test } from "node:test";
import { parseModelJson, parseTopics, parseTranscription } from "./model-json.ts";

test("parseModelJson strips a markdown fence around the object", () => {
  assert.deepEqual(parseModelJson("```json\n{\"a\":1}\n```"), { a: 1 });
});

test("parseModelJson tolerates prose before and after the object", () => {
  assert.deepEqual(parseModelJson("Aquí tienes:\n{\"a\":1}\nEso es todo."), { a: 1 });
});

test("parseModelJson throws when there is no object at all", () => {
  assert.throws(() => parseModelJson("lo siento, no puedo"));
});

test("parseTranscription reads text and defaults isBlank to false", () => {
  assert.deepEqual(parseTranscription("{\"text\":\"set\"}"), { text: "set", isBlank: false });
});

test("parseTranscription throws when text is missing", () => {
  assert.throws(() => parseTranscription("{\"isBlank\":true}"));
});

test("parseTopics keeps only integer pages and requires id, label, pages", () => {
  const topics = parseTopics("{\"topics\":[{\"id\":\"sets\",\"label\":\"set\",\"pages\":[1,2.5,3]}]}");
  assert.deepEqual(topics, [{ id: "sets", label: "set", pages: [1, 3], parent: null }]);
});

test("parseTopics reads the parent reference and normalizes an absent one to null", () => {
  const topics = parseTopics(
    "{\"topics\":[{\"id\":\"a\",\"label\":\"A\",\"pages\":[1],\"parent\":null},{\"id\":\"b\",\"label\":\"B\",\"pages\":[2],\"parent\":\"a\"}]}"
  );
  assert.deepEqual(topics, [
    { id: "a", label: "A", pages: [1], parent: null },
    { id: "b", label: "B", pages: [2], parent: "a" }
  ]);
});

test("parseTopics throws when the topics array is absent", () => {
  assert.throws(() => parseTopics("{\"temas\":[]}"));
});
