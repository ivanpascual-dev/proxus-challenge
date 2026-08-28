import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { MaterialIndex, MaterialIndexContent } from "./material-index.ts";

test("MaterialIndexContent round-trips through JSON", () => {
  const content = {
    contentHash: "abc",
    pageCount: 2,
    indexedAt: "2026-08-28T00:00:00.000Z",
    threshold: 600,
    topics: [{ id: "sets", label: "set", pages: [1, 2], parentId: null }],
    pages: [{ page: 1, provenance: "transcribed" as const, text: "PYTHON", denseCharacters: 6, topicIds: ["sets"] }],
    failedPages: [{ page: 2, reason: "el modelo devolvió JSON no parseable" }]
  };
  const codec = Schema.fromJsonString(MaterialIndexContent);
  const back = Schema.decodeUnknownSync(codec)(Schema.encodeUnknownSync(codec)(content));
  assert.deepEqual(back.topics, [{ id: "sets", label: "set", pages: [1, 2], parentId: null }]);
  assert.deepEqual(back.pages, content.pages);
  assert.deepEqual(back.failedPages, [{ page: 2, reason: "el modelo devolvió JSON no parseable" }]);
});

test("MaterialIndex adds identity on top of the stored content", () => {
  const index = Schema.decodeUnknownSync(MaterialIndex)({
    contentHash: "abc",
    pageCount: 1,
    indexedAt: "2026-08-28T00:00:00.000Z",
    threshold: 600,
    topics: [],
    pages: [],
    failedPages: [],
    materialId: "SETS",
    fileName: "SETS.pdf"
  });
  assert.equal(index.materialId, "SETS");
  assert.equal(index.fileName, "SETS.pdf");
});
