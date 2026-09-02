import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import type { ConversationSource } from "@proxus/shared";
import { makeTurnSourceRecorder, mergeTurnSource } from "./turn-sources.ts";

const source = (
  materialId: string,
  pages: readonly number[],
  transcribedPages: readonly number[] = []
): ConversationSource => ({ materialId, title: `Material ${materialId}`, pages, transcribedPages });

test("una llamada que no sirvió ninguna página no crea fuente", () => {
  const result = mergeTurnSource([], source("algebra", []));

  assert.deepEqual(result.sources, []);
  assert.equal(result.emitted, null);
});

test("un material nuevo se añade al final y se emite con sus páginas ordenadas", () => {
  const result = mergeTurnSource([source("algebra", [1])], source("calculo", [7, 3]));

  assert.deepEqual(result.sources.map((entry) => entry.materialId), ["algebra", "calculo"]);
  assert.deepEqual(result.emitted?.pages, [3, 7]);
});

test("el mismo material con páginas nuevas fusiona sin duplicar y emite la entrada entera", () => {
  const result = mergeTurnSource([source("algebra", [3, 4])], source("algebra", [4, 1]));

  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0]?.pages, [1, 3, 4]);
  assert.deepEqual(result.emitted?.pages, [1, 3, 4]);
});

test("repetir exactamente las mismas páginas no emite nada", () => {
  const result = mergeTurnSource([source("algebra", [3, 4])], source("algebra", [4, 3]));

  assert.equal(result.emitted, null);
  assert.deepEqual(result.sources[0]?.pages, [3, 4]);
});

test("una página ya vista que ahora se sabe transcrita vuelve a emitirse", () => {
  const result = mergeTurnSource([source("algebra", [3])], source("algebra", [3], [3]));

  assert.deepEqual(result.emitted?.transcribedPages, [3]);
  assert.deepEqual(result.sources[0]?.pages, [3]);
});

test("el título de la primera aparición se conserva aunque llegue otro", () => {
  const renamed: ConversationSource = { ...source("algebra", [9]), title: "Otro nombre" };
  const result = mergeTurnSource([source("algebra", [3])], renamed);

  assert.equal(result.sources[0]?.title, "Material algebra");
});

test("el registro del turno acumula y solo notifica lo que aporta algo nuevo", async () => {
  const emitted: ConversationSource[] = [];
  const program = Effect.gen(function* () {
    const recorder = yield* makeTurnSourceRecorder((entry) => Effect.sync(() => {
      emitted.push(entry);
    }));

    yield* recorder.record(source("algebra", [3]));
    yield* recorder.record(source("algebra", [3]));
    yield* recorder.record(source("algebra", [4]));
    yield* recorder.record(source("calculo", []));

    return yield* recorder.collected;
  });

  const collected = await Effect.runPromise(program);

  assert.deepEqual(collected.map((entry) => entry.materialId), ["algebra"]);
  assert.deepEqual(collected[0]?.pages, [3, 4]);
  assert.deepEqual(emitted.map((entry) => entry.pages), [[3], [3, 4]]);
});
