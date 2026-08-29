import assert from "node:assert/strict";
import { test } from "node:test";
import { Option, Result } from "effect";
import { LIMITS } from "@proxus/shared";
import { applyBlockInputs, checkNoteLimits } from "./note-blocks.ts";
import type { NoteBlock, NoteBlockInput } from "./artifact.ts";

const block = (over: Partial<NoteBlock> = {}): NoteBlock => ({
  id: "b1",
  markdown: "hola",
  author: "student",
  emphasis: false,
  source: null,
  ...over
});

const input = (over: Partial<NoteBlockInput> = {}): NoteBlockInput => ({
  markdown: "hola",
  author: "student",
  emphasis: false,
  source: null,
  ...over
});

test("checkNoteLimits: título justo en el techo pasa, uno por encima no", () => {
  const ok = checkNoteLimits({ title: "t".repeat(LIMITS.maxNoteTitleCharacters), blocks: [] });
  assert.ok(Option.isNone(ok));

  const bad = checkNoteLimits({ title: "t".repeat(LIMITS.maxNoteTitleCharacters + 1), blocks: [] });
  assert.ok(Option.isSome(bad));
  assert.equal(bad.value.limit, "maxNoteTitleCharacters");
  assert.equal(bad.value.received, LIMITS.maxNoteTitleCharacters + 1);
});

test("checkNoteLimits: número de bloques justo en el techo pasa, uno por encima no", () => {
  const atCeiling = Array.from({ length: LIMITS.maxBlocksPerNote }, () => input());
  assert.ok(Option.isNone(checkNoteLimits({ title: "t", blocks: atCeiling })));

  const overCeiling = Array.from({ length: LIMITS.maxBlocksPerNote + 1 }, () => input());
  const bad = checkNoteLimits({ title: "t", blocks: overCeiling });
  assert.ok(Option.isSome(bad));
  assert.equal(bad.value.limit, "maxBlocksPerNote");
  assert.equal(bad.value.received, LIMITS.maxBlocksPerNote + 1);
});

test("checkNoteLimits: caracteres por bloque justo en el techo pasa, uno por encima nombra el bloque", () => {
  const atCeiling = input({ id: "b1", markdown: "x".repeat(LIMITS.maxBlockCharacters) });
  assert.ok(Option.isNone(checkNoteLimits({ title: "t", blocks: [atCeiling] })));

  const overCeiling = input({ id: "b1", markdown: "x".repeat(LIMITS.maxBlockCharacters + 1) });
  const bad = checkNoteLimits({ title: "t", blocks: [overCeiling] });
  assert.ok(Option.isSome(bad));
  assert.equal(bad.value.limit, "maxBlockCharacters");
  assert.equal(bad.value.blockId, "b1");
  assert.equal(bad.value.received, LIMITS.maxBlockCharacters + 1);
});

test("applyBlockInputs: id desconocido se rechaza", () => {
  const result = applyBlockInputs([block({ id: "b1" })], [input({ id: "fantasma" })]);
  assert.ok(Result.isFailure(result));
  assert.equal(result.failure._tag, "UnknownBlock");
  assert.equal(result.failure.blockId, "fantasma");
});

test("applyBlockInputs: id presente se conserva, id ausente genera uno nuevo, orden respetado", () => {
  const previous = [block({ id: "b1", markdown: "viejo" })];
  const result = applyBlockInputs(previous, [
    input({ markdown: "nuevo primero" }),
    input({ id: "b1", markdown: "editado" })
  ]);

  assert.ok(Result.isSuccess(result));
  assert.equal(result.success.length, 2);
  const [first, second] = result.success as readonly [NoteBlock, NoteBlock];
  assert.equal(first.markdown, "nuevo primero");
  assert.notEqual(first.id, "b1");
  assert.equal(first.id.length > 0, true);
  assert.equal(second.id, "b1");
  assert.equal(second.markdown, "editado");
});

test("applyBlockInputs: marcar un bloque no toca ningún otro campo (F2-06)", () => {
  const previous = [block({ id: "b1", markdown: "texto", author: "tutor", emphasis: false })];
  const result = applyBlockInputs(previous, [
    input({ id: "b1", markdown: "texto", author: "tutor", emphasis: true })
  ]);

  assert.ok(Result.isSuccess(result));
  assert.deepEqual(result.success.at(0), {
    id: "b1",
    markdown: "texto",
    author: "tutor",
    emphasis: true,
    source: null
  });
});

test("applyBlockInputs: una fuente de material se guarda sin fragmento (lo rellena resolveSources)", () => {
  const result = applyBlockInputs([], [
    input({ source: { type: "material", materialId: "conjuntos", pages: [3] } })
  ]);

  assert.ok(Result.isSuccess(result));
  assert.deepEqual(result.success.at(0)?.source, {
    type: "material",
    materialId: "conjuntos",
    pages: [3],
    excerpt: null,
    excerptTruncated: false,
    transcribed: false,
    unanchoredReason: null
  });
});
