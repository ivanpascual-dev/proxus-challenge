import assert from "node:assert/strict";
import { test } from "node:test";
import { Option, Result } from "effect";
import { LIMITS } from "@proxus/shared";
import { addProposal, applyBlockInputs, applyProposal, bindProposalTarget, checkNoteLimits, rejectProposal } from "./note-blocks.ts";
import type { NoteArtifact, NoteBlock, NoteBlockInput, NoteProposal } from "./artifact.ts";

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

const note = (over: Partial<NoteArtifact> = {}): NoteArtifact => ({
  kind: "note",
  id: "n1",
  title: "Apuntes",
  materialId: "m1",
  blocks: [block({ id: "b1", markdown: "definición vieja" })],
  proposals: [],
  ...over
});

const proposal = (operation: NoteProposal["operation"], over: Partial<NoteProposal> = {}): NoteProposal => ({
  id: "p1",
  createdAt: "2026-08-29T00:00:00.000Z",
  rationale: "por qué",
  operation,
  ...over
});

test("bindProposalTarget: replace guarda el texto actual del bloque como baseMarkdown (ADR-014 enmienda)", () => {
  const current = note({ blocks: [block({ id: "b1", markdown: "texto que hay ahora" })] });
  const bound = bindProposalTarget(current.blocks, { type: "replace", blockId: "b1", markdown: "texto nuevo" });
  assert.ok(Result.isSuccess(bound));
  assert.deepEqual(bound.success, {
    type: "replace",
    blockId: "b1",
    markdown: "texto nuevo",
    baseMarkdown: "texto que hay ahora"
  });
});

test("bindProposalTarget: remove guarda el texto actual como baseMarkdown", () => {
  const current = note({ blocks: [block({ id: "b1", markdown: "para borrar" })] });
  const bound = bindProposalTarget(current.blocks, { type: "remove", blockId: "b1" });
  assert.ok(Result.isSuccess(bound));
  assert.deepEqual(bound.success, { type: "remove", blockId: "b1", baseMarkdown: "para borrar" });
});

test("bindProposalTarget: blockId que el apunte no tiene se rechaza con BlockNotFound", () => {
  const bound = bindProposalTarget(note().blocks, { type: "replace", blockId: "fantasma", markdown: "x" });
  assert.ok(Result.isFailure(bound));
  assert.equal(bound.failure._tag, "BlockNotFound");
  assert.equal(bound.failure.blockId, "fantasma");
});

test("addProposal: justo en el techo pasa, la siguiente se rechaza nombrándolo (F2-30)", () => {
  const full = Array.from({ length: LIMITS.maxPendingProposalsPerNote - 1 }, (_, index) =>
    proposal({ type: "remove", blockId: "b1", baseMarkdown: "definición vieja" }, { id: `p${index}` }));
  const ok = addProposal(note({ proposals: full }), proposal({ type: "remove", blockId: "b1", baseMarkdown: "definición vieja" }));
  assert.ok(Result.isSuccess(ok));

  const over = addProposal(ok.success, proposal({ type: "remove", blockId: "b1", baseMarkdown: "x" }, { id: "extra" }));
  assert.ok(Result.isFailure(over));
  assert.equal(over.failure._tag, "TooManyProposals");
  assert.equal(over.failure.ceiling, LIMITS.maxPendingProposalsPerNote);
});

test("applyProposal: insert añade el bloque en su sitio y retira la propuesta (F2-28)", () => {
  const inserted = block({ id: "ignored", markdown: "definición nueva", author: "tutor" });
  const result = applyProposal(
    note({ proposals: [proposal({ type: "insert", afterBlockId: "b1", block: inserted })] }),
    "p1"
  );
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success.blocks.length, 2);
  assert.equal(result.success.blocks[1]?.markdown, "definición nueva");
  assert.notEqual(result.success.blocks[1]?.id, "ignored");
  assert.equal(result.success.proposals.length, 0);
});

test("applyProposal: insert con afterBlockId null va al principio", () => {
  const inserted = block({ id: "x", markdown: "intro", author: "tutor" });
  const result = applyProposal(
    note({ proposals: [proposal({ type: "insert", afterBlockId: null, block: inserted })] }),
    "p1"
  );
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success.blocks[0]?.markdown, "intro");
});

test("applyProposal: replace cambia solo ese bloque cuando baseMarkdown coincide", () => {
  const result = applyProposal(
    note({ proposals: [proposal({ type: "replace", blockId: "b1", markdown: "definición corregida", baseMarkdown: "definición vieja" })] }),
    "p1"
  );
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success.blocks[0]?.markdown, "definición corregida");
  assert.equal(result.success.proposals.length, 0);
});

test("applyProposal: remove borra el bloque cuando baseMarkdown coincide", () => {
  const result = applyProposal(
    note({ proposals: [proposal({ type: "remove", blockId: "b1", baseMarkdown: "definición vieja" })] }),
    "p1"
  );
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success.blocks.length, 0);
});

test("applyProposal: baseMarkdown que ya no coincide se rechaza con ProposalStale y los dos textos (F2-29)", () => {
  const result = applyProposal(
    note({
      blocks: [block({ id: "b1", markdown: "definición editada a mano" })],
      proposals: [proposal({ type: "replace", blockId: "b1", markdown: "otra", baseMarkdown: "definición vieja" })]
    }),
    "p1"
  );
  assert.ok(Result.isFailure(result));
  assert.equal(result.failure._tag, "ProposalStale");
  assert.equal(result.failure.seen, "definición vieja");
  assert.equal(result.failure.current, "definición editada a mano");
});

test("applyProposal: propuesta inexistente se rechaza con ProposalNotFound", () => {
  const result = applyProposal(note(), "fantasma");
  assert.ok(Result.isFailure(result));
  assert.equal(result.failure._tag, "ProposalNotFound");
});

test("rejectProposal: retira la propuesta sin tocar los bloques (F2-28)", () => {
  const result = rejectProposal(
    note({ proposals: [proposal({ type: "remove", blockId: "b1", baseMarkdown: "definición vieja" })] }),
    "p1"
  );
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success.proposals.length, 0);
  assert.equal(result.success.blocks.length, 1);
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
