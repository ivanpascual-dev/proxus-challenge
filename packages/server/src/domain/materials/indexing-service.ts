import { Context, Data, Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { LIMITS, type IndexedPage, type MaterialIndexContent, type MaterialTopic, type UnindexedPage } from "@proxus/shared";
import { PdfService } from "./pdf-service.ts";
import { classifyPage, countDenseCharacters, type PageProvenance } from "./page-classifier.ts";
import { parseTopics, parseTranscription } from "./model-json.ts";
import { TRANSCRIPTION_PROMPT, topicsPrompt } from "./indexing-prompts.ts";

export class IndexingError extends Data.TaggedError("IndexingError")<{
  readonly reason: string;
}> {}

// Evento de progreso observable: el script lo imprime, la interfaz lo muestra mientras se indexa.
export interface IndexProgress {
  readonly page: number | null; // null = fase de temas del material
  readonly pageCount: number;
  readonly message: string;
}

export interface IndexMaterialInput {
  readonly path: string;
  readonly contentHash: string;
  readonly pageCount: number;
}

export type IndexProgressSink = (progress: IndexProgress) => Effect.Effect<void>;

export interface IndexingService {
  readonly indexMaterial: (
    input: IndexMaterialInput,
    onProgress?: IndexProgressSink
  ) => Effect.Effect<MaterialIndexContent, IndexingError, LanguageModel.LanguageModel>;
}

export const IndexingService = Context.Service<IndexingService>(
  "@proxus/server/materials/IndexingService"
);

const truncate = (text: string) => text.slice(0, LIMITS.maxIndexedCharactersPerPage);

const indexedEntry = (page: number, provenance: PageProvenance, text: string): IndexedPage => ({
  page,
  provenance,
  text,
  denseCharacters: countDenseCharacters(text),
  topicIds: []
});

type PageOutcome =
  | { readonly kind: "indexed"; readonly entry: IndexedPage }
  | { readonly kind: "failed"; readonly entry: UnindexedPage };

const imagePart = (page: number, image: { readonly mediaType: "image/png"; readonly data: string }) => ({
  type: "file" as const,
  mediaType: image.mediaType,
  data: image.data,
  fileName: `page-${page}.png`
});

export const IndexingServiceLive = Layer.effect(
  IndexingService,
  Effect.gen(function* () {
    const pdf = yield* PdfService;

    const indexPage = (
      input: IndexMaterialInput,
      page: number,
      emit: IndexProgressSink
    ): Effect.Effect<IndexedPage, UnindexedPage, LanguageModel.LanguageModel> => Effect.gen(function* () {
      yield* emit({ page, pageCount: input.pageCount, message: `página ${page} de ${input.pageCount}: extrayendo texto` });

      const extracted = yield* pdf.extractText({ path: input.path, page }).pipe(
        Effect.mapError((error): UnindexedPage => ({ page, reason: `no se pudo extraer el texto: ${String(error.reason)}` }))
      );

      const provenance = classifyPage(extracted);
      if (provenance === "extracted") {
        return indexedEntry(page, "extracted", truncate(extracted));
      }

      yield* emit({ page, pageCount: input.pageCount, message: `página ${page} de ${input.pageCount}: transcribiendo con el modelo` });

      const image = yield* pdf.renderPage({ path: input.path, page }).pipe(
        Effect.mapError((error): UnindexedPage => ({ page, reason: `no se pudo renderizar para transcribir: ${String(error.reason)}` }))
      );

      const response = yield* LanguageModel.generateText({
        prompt: [
          { role: "system", content: TRANSCRIPTION_PROMPT },
          { role: "user", content: [imagePart(page, image)] }
        ]
      }).pipe(
        Effect.mapError((error): UnindexedPage => ({ page, reason: `la transcripción falló: ${String(error)}` }))
      );

      return yield* Effect.try({
        try: () => {
          const parsed = parseTranscription(response.text);
          // isBlank afirmado por el modelo => es una página en blanco de verdad, texto "" es correcto.
          // Un fallo de parseo, en cambio, va a failedPages (abajo): "" de un fallo es indistinguible
          // de una página en blanco (invariante 3).
          return indexedEntry(page, "transcribed", truncate(parsed.isBlank ? "" : parsed.text));
        },
        catch: (error): UnindexedPage => ({ page, reason: `la transcripción no se pudo parsear: ${String(error)}` })
      });
    });

    const indexMaterial = (input: IndexMaterialInput, onProgress?: IndexProgressSink) => Effect.gen(function* () {
      const emit: IndexProgressSink = onProgress ?? (() => Effect.void);
      const pageNumbers = Array.from({ length: input.pageCount }, (_, i) => i + 1);

      const outcomes = yield* Effect.forEach(
        pageNumbers,
        (page): Effect.Effect<PageOutcome, never, LanguageModel.LanguageModel> => indexPage(input, page, emit).pipe(
          Effect.map((entry): PageOutcome => ({ kind: "indexed", entry })),
          Effect.catch((entry) => Effect.succeed<PageOutcome>({ kind: "failed", entry }))
        ),
        { concurrency: LIMITS.indexConcurrency }
      );

      const indexedPages = outcomes.flatMap((outcome) => outcome.kind === "indexed" ? [outcome.entry] : []);
      const failedPages = outcomes.flatMap((outcome) => outcome.kind === "failed" ? [outcome.entry] : []);

      if (indexedPages.length === 0) {
        return yield* new IndexingError({
          reason: `no se pudo indexar ninguna de las ${input.pageCount} páginas`
        });
      }

      yield* emit({ page: null, pageCount: input.pageCount, message: "generando los temas del material" });

      const topics = yield* generateTopics(indexedPages);

      const indexedAt = yield* Effect.sync(() => new Date().toISOString());

      const pagesWithTopics: readonly IndexedPage[] = indexedPages.map((entry) => ({
        ...entry,
        topicIds: topics.filter((topic) => topic.pages.includes(entry.page)).map((topic) => topic.id)
      }));

      return {
        contentHash: input.contentHash,
        pageCount: input.pageCount,
        indexedAt,
        threshold: LIMITS.textDensityThreshold,
        topics,
        pages: pagesWithTopics,
        failedPages
      } satisfies MaterialIndexContent;
    });

    const generateTopics = (
      pages: readonly IndexedPage[]
    ): Effect.Effect<readonly MaterialTopic[], IndexingError, LanguageModel.LanguageModel> => Effect.gen(function* () {
      const withContent = pages.filter((page) => page.text.trim().length > 0);
      if (withContent.length === 0) {
        return [];
      }

      const body = withContent.map((page) => `[página ${page.page}]\n${page.text}`).join("\n\n");

      const response = yield* LanguageModel.generateText({
        prompt: [
          { role: "system", content: topicsPrompt() },
          { role: "user", content: body }
        ]
      }).pipe(
        Effect.mapError((error) => new IndexingError({ reason: `la llamada de temas falló: ${String(error)}` }))
      );

      return yield* Effect.try({
        try: () => parseTopics(response.text)
          .filter((topic) => topic.pages.length > 0)
          .slice(0, LIMITS.maxTopicsPerMaterial)
          .map((topic): MaterialTopic => ({ id: topic.id, label: topic.label, pages: topic.pages })),
        catch: (error) => new IndexingError({ reason: `los temas no se pudieron parsear: ${String(error)}` })
      });
    });

    return { indexMaterial };
  })
);
