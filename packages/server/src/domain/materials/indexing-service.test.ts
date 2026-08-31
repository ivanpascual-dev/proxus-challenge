import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Stream } from "effect";
import { LanguageModel, Response } from "effect/unstable/ai";
import { LIMITS } from "@proxus/shared";
import { PdfService, PdfServiceError } from "./pdf-service.ts";
import { IndexingService, IndexingServiceLive } from "./indexing-service.ts";

// --- fakes ---------------------------------------------------------------

interface FakePages {
  readonly [page: number]: string; // texto embebido que devuelve pdftotext
}

const fakePdf = (pages: FakePages) => Layer.succeed(
  PdfService,
  PdfService.of({
    pageCount: () => Effect.succeed(Object.keys(pages).length),
    extractText: ({ page }) => page in pages
      ? Effect.succeed(pages[page]!)
      : Effect.fail(new PdfServiceError({ reason: `sin página ${page}` })),
    renderPage: ({ page }) => Effect.succeed({
      page,
      mediaType: "image/png" as const,
      data: "data:image/png;base64,AAAA"
    })
  })
);

// Responde según qué prompt de sistema recibe. `transcription` puede ser texto libre (para simular
// una respuesta no parseable).
const fakeModel = (replies: { readonly transcription: string; readonly topics: string }) => Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) => {
      const serialized = JSON.stringify(options.prompt);
      const text = serialized.includes("transcriber of academic material pages")
        ? replies.transcription
        : replies.topics;
      return Effect.succeed([Response.makePart("text", { text })]);
    },
    streamText: () => Stream.empty
  })
);

const validTopics = JSON.stringify({
  topics: [
    { id: "sets", label: "set", pages: [1, 2], parent: null },
    { id: "listas", label: "listas", pages: [2], parent: "sets" },
    { id: "tuplas", label: "tuplas", pages: [1], parent: null }
  ]
});

const run = <A, E>(
  effect: Effect.Effect<A, E, IndexingService | LanguageModel.LanguageModel>,
  layers: Layer.Layer<IndexingService | LanguageModel.LanguageModel>
) => Effect.runPromise(effect.pipe(Effect.provide(layers)) as Effect.Effect<A, E>);

const dense = "estudiante ".repeat(80); // > 600 caracteres no blancos => extracted

// --- tests -------------------------------------------------------------

test("una página densa se indexa como extracted sin llamar al modelo para transcribir", async () => {
  const layers = Layer.mergeAll(
    IndexingServiceLive.pipe(Layer.provide(fakePdf({ 1: dense, 2: dense }))),
    fakeModel({ transcription: "NO DEBERÍA LLAMARSE", topics: validTopics })
  );
  const index = await run(
    Effect.gen(function* () {
      const service = yield* IndexingService;
      return yield* service.indexMaterial({ path: "/x.pdf", contentHash: "h", pageCount: 2 });
    }),
    layers
  );

  assert.equal(index.pages.length, 2);
  assert.equal(index.pages.every((page) => page.provenance === "extracted"), true);
  assert.equal(index.failedPages.length, 0);
  assert.equal(index.threshold, LIMITS.textDensityThreshold);
  assert.deepEqual(index.pages.find((page) => page.page === 1)?.topicIds, ["sets", "tuplas"]);
  // La jerarquía del modelo llega hasta el índice: `listas` cuelga de `sets`.
  assert.equal(index.topics.find((topic) => topic.id === "listas")?.parentId, "sets");
  assert.equal(index.topics.find((topic) => topic.id === "sets")?.parentId, null);
});

test("una página escasa se transcribe y su procedencia queda como transcribed", async () => {
  const layers = Layer.mergeAll(
    IndexingServiceLive.pipe(Layer.provide(fakePdf({ 1: "hola", 2: dense }))),
    fakeModel({ transcription: JSON.stringify({ text: "PYTHON set", isBlank: false }), topics: validTopics })
  );
  const index = await run(
    Effect.gen(function* () {
      const service = yield* IndexingService;
      return yield* service.indexMaterial({ path: "/x.pdf", contentHash: "h", pageCount: 2 });
    }),
    layers
  );

  const page1 = index.pages.find((page) => page.page === 1);
  assert.equal(page1?.provenance, "transcribed");
  assert.equal(page1?.text, "PYTHON set");
  assert.equal(index.failedPages.length, 0);
});

test("si la transcripción no se puede parsear, la página va a failedPages y no a pages con texto vacío", async () => {
  const layers = Layer.mergeAll(
    IndexingServiceLive.pipe(Layer.provide(fakePdf({ 1: "hola", 2: dense }))),
    fakeModel({ transcription: "lo siento, no puedo transcribir esta imagen", topics: validTopics })
  );
  const index = await run(
    Effect.gen(function* () {
      const service = yield* IndexingService;
      return yield* service.indexMaterial({ path: "/x.pdf", contentHash: "h", pageCount: 2 });
    }),
    layers
  );

  assert.equal(index.pages.some((page) => page.page === 1), false);
  const failed = index.failedPages.find((page) => page.page === 1);
  assert.ok(failed, "la página 1 debe estar en failedPages");
  assert.match(failed!.reason, /no se pudo interpretar/i);
});
