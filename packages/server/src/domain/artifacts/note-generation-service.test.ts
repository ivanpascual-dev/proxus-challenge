import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Option, Stream } from "effect";
import { LanguageModel, Response } from "effect/unstable/ai";
import type { MaterialIndex } from "@proxus/shared";
import { MaterialNotFound, MaterialNotIndexed, MaterialRepository, type PdfMaterial } from "../materials/material.ts";
import { ArtifactRepository, ArtifactNotFound, type Artifact } from "./artifact.ts";
import { NoteGenerationService, NoteGenerationServiceLive } from "./note-generation-service.ts";

// --- fakes ---------------------------------------------------------------

const material: PdfMaterial = {
  id: "psico-social",
  title: "Psicología Social",
  fileName: "psico-social.pdf",
  pageCount: 4,
  uploadedAt: "2026-08-01T00:00:00.000Z",
  indexState: "indexed"
};

const index: MaterialIndex = {
  materialId: material.id,
  fileName: material.fileName,
  contentHash: "hash",
  pageCount: 4,
  indexedAt: "2026-08-01T00:00:00.000Z",
  threshold: 600,
  topics: [
    { id: "evolucion", label: "Influencia de la evolución", pages: [1, 2], parentId: null },
    { id: "cerebro-social", label: "Cerebro social", pages: [1], parentId: "evolucion" },
    { id: "seleccion", label: "Selección natural", pages: [2], parentId: "evolucion" },
    { id: "cultura", label: "Influencia de la cultura", pages: [3, 4], parentId: null }
  ],
  pages: [
    { page: 1, provenance: "extracted", text: "La vida en grupo moldeó el cerebro. ".repeat(20), denseCharacters: 700, topicIds: ["evolucion", "cerebro-social"] },
    { page: 2, provenance: "extracted", text: "La selección natural favorece la conducta social. ".repeat(20), denseCharacters: 700, topicIds: ["evolucion", "seleccion"] },
    { page: 3, provenance: "extracted", text: "La cultura es producto y modificadora de la evolución. ".repeat(20), denseCharacters: 700, topicIds: ["cultura"] },
    { page: 4, provenance: "extracted", text: "Individualismo y colectivismo como dimensiones. ".repeat(20), denseCharacters: 700, topicIds: ["cultura"] }
  ],
  failedPages: []
};

const fakeMaterials = (overrides?: Partial<MaterialRepository>) => Layer.succeed(
  MaterialRepository,
  MaterialRepository.of({
    list: () => Effect.succeed([material]),
    get: (id) => id === material.id ? Effect.succeed(material) : Effect.fail(new MaterialNotFound({ materialId: id })),
    renderPage: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
    getIndex: (id) => id === material.id ? Effect.succeed(index) : Effect.fail(new MaterialNotFound({ materialId: id })),
    reindex: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
    upload: () => Effect.die("stub: upload no debería llamarse en este test"),
    validate: () => Effect.die("stub: validate no debería llamarse en este test"),
    remove: () => Effect.die("stub: remove no debería llamarse en este test"),
    ...overrides
  })
);

const fakeArtifacts = (store: Artifact[]) => Layer.succeed(
  ArtifactRepository,
  ArtifactRepository.of({
    saveArtifact: (artifact) => Effect.sync(() => {
      const at = store.findIndex((candidate) => candidate.id === artifact.id);
      if (at === -1) { store.push(artifact); } else { store[at] = artifact; }
    }),
    getArtifact: (id) => {
      const found = store.find((candidate) => candidate.id === id);
      return found === undefined ? Effect.fail(new ArtifactNotFound({ artifactId: id })) : Effect.succeed(found);
    },
    deleteArtifact: () => Effect.void,
    listArtifacts: (input) => Effect.succeed({
      artifacts: input?.kind === undefined ? store : store.filter((candidate) => candidate.kind === input.kind),
      unreadable: []
    }),
    saveAttempt: () => Effect.void,
    getAttempt: () => Effect.die("not used"),
    listAttempts: () => Effect.succeed([])
  })
);

// El modelo devuelve una marca por tema, para comprobar que cada bloque redacta SU tema.
const fakeModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) => {
      const serialized = JSON.stringify(options.prompt);
      const match = serialized.match(/Tema: ([^\\]+?)\\n/);
      return Effect.succeed([Response.makePart("text", { text: `Prosa sobre ${match?.[1] ?? "?"}.` })]);
    },
    streamText: () => Stream.empty
  })
);

const run = <A, E>(effect: Effect.Effect<A, E, NoteGenerationService | LanguageModel.LanguageModel>, layer: Layer.Layer<NoteGenerationService | LanguageModel.LanguageModel>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E>);

const forMaterial = (materialId: string, store: Artifact[], materialsOverride?: Partial<MaterialRepository>) => run(
  Effect.gen(function* () {
    const service = yield* NoteGenerationService;
    return yield* service.forMaterial(materialId);
  }),
  Layer.mergeAll(
    NoteGenerationServiceLive.pipe(
      Layer.provide(fakeArtifacts(store)),
      Layer.provide(fakeMaterials(materialsOverride))
    ),
    fakeModel
  )
);

// --- tests -------------------------------------------------------------

test("un bloque por tema hoja del índice, en orden, con la cita de páginas del tema", async () => {
  const store: Artifact[] = [];
  const note = await forMaterial(material.id, store);

  assert.equal(note.kind, "note");
  assert.equal(note.materialId, material.id);
  // Temas hoja: cerebro-social, seleccion, cultura (evolucion tiene hijos).
  assert.equal(note.blocks.length, 3);
  assert.deepEqual(note.blocks.map((block) => block.markdown.split("\n")[0]), [
    "## Cerebro social",
    "## Selección natural",
    "## Influencia de la cultura"
  ]);
  assert.deepEqual(
    note.blocks.map((block) => (block.source?.type === "material" ? block.source.pages : null)),
    [[1], [2], [3, 4]]
  );
  // El fragmento cacheado lo rellena el servidor desde el índice (invariante 8), no el modelo.
  assert.ok(note.blocks.every((block) => block.source?.type === "material" && block.source.excerpt !== null));
  assert.equal(store.length, 1);
});

test("el segundo intento sobre el mismo material se rechaza con MaterialAlreadyHasNote", async () => {
  const store: Artifact[] = [];
  const first = await forMaterial(material.id, store);

  await assert.rejects(
    forMaterial(material.id, store),
    (error: unknown) => (error as { _tag?: string })._tag === "MaterialAlreadyHasNote"
      && (error as { noteId?: string }).noteId === first.id
  );
});

test("existingNoteId: none antes de generar, el id del apunte después (F2-34, para el 409 previo al stream)", async () => {
  const store: Artifact[] = [];
  const layer = Layer.mergeAll(
    NoteGenerationServiceLive.pipe(Layer.provide(fakeArtifacts(store)), Layer.provide(fakeMaterials())),
    fakeModel
  );

  const before = await run(
    Effect.gen(function* () {
      const service = yield* NoteGenerationService;
      return yield* service.existingNoteId(material.id);
    }),
    layer
  );
  assert.equal(Option.isNone(before), true);

  const note = await run(
    Effect.gen(function* () {
      const service = yield* NoteGenerationService;
      return yield* service.forMaterial(material.id);
    }),
    layer
  );

  const after = await run(
    Effect.gen(function* () {
      const service = yield* NoteGenerationService;
      return yield* service.existingNoteId(material.id);
    }),
    layer
  );
  assert.deepEqual(after, Option.some(note.id));
});

test("un material sin indexar falla con un motivo claro, sin crear nada", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    forMaterial(material.id, store, { getIndex: (id) => Effect.fail(new MaterialNotIndexed({ materialId: id })) }),
    (error: unknown) => (error as { _tag?: string })._tag === "NoteGenerationError"
      && /no está indexado/.test((error as { reason: string }).reason)
  );
  assert.equal(store.length, 0);
});
