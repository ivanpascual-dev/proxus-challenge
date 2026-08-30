import { Context, Data, Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { LIMITS, type IndexedPage, type MaterialIndexContent, type MaterialTopic, type UnindexedPage } from "@proxus/shared";
import { PdfService } from "./pdf-service.ts";
import { classifyPage, countDenseCharacters, type PageProvenance } from "./page-classifier.ts";
import { parseTopics, parseTranscription } from "./model-json.ts";
import { normalizeTopicHierarchy } from "./topic-hierarchy.ts";
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
        Effect.tapError((error) => Effect.logWarning(`indexación: no se pudo extraer el texto de la página ${page}: ${String(error.reason)}`)),
        Effect.mapError((): UnindexedPage => ({ page, reason: "no se pudo extraer el texto de esta página" }))
      );

      const provenance = classifyPage(extracted);
      if (provenance === "extracted") {
        return indexedEntry(page, "extracted", truncate(extracted));
      }

      yield* emit({ page, pageCount: input.pageCount, message: `página ${page} de ${input.pageCount}: transcribiendo con el modelo` });

      const image = yield* pdf.renderPage({ path: input.path, page }).pipe(
        Effect.tapError((error) => Effect.logWarning(`indexación: no se pudo renderizar la página ${page}: ${String(error.reason)}`)),
        Effect.mapError((): UnindexedPage => ({ page, reason: "no se pudo preparar esta página para transcribirla" }))
      );

      const response = yield* LanguageModel.generateText({
        prompt: [
          { role: "system", content: TRANSCRIPTION_PROMPT },
          { role: "user", content: [imagePart(page, image)] }
        ]
      }).pipe(
        Effect.tapError((error) => Effect.logWarning(`indexación: la transcripción de la página ${page} falló: ${String(error)}`)),
        Effect.mapError((): UnindexedPage => ({ page, reason: "el modelo no pudo transcribir esta página" }))
      );

      return yield* Effect.try({
        try: () => {
          const parsed = parseTranscription(response.text);
          // isBlank afirmado por el modelo => es una página en blanco de verdad, texto "" es correcto.
          // Un fallo de parseo, en cambio, va a failedPages (abajo): "" de un fallo es indistinguible
          // de una página en blanco (invariante 3).
          return indexedEntry(page, "transcribed", truncate(parsed.isBlank ? "" : parsed.text));
        },
        catch: (): UnindexedPage => ({ page, reason: "la transcripción del modelo no se pudo interpretar" })
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

      const topics = yield* generateTopics(indexedPages, input.pageCount);

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
      pages: readonly IndexedPage[],
      pageCount: number
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
        Effect.tapError((error) => Effect.logWarning(`indexación: la llamada de temas al modelo falló: ${String(error)}`)),
        Effect.mapError(() => new IndexingError({ reason: "el modelo no respondió al detectar los temas" }))
      );

      return yield* Effect.try({
        try: () =>
          normalizeTopicHierarchy(parseTopics(response.text), pageCount)
            .slice(0, LIMITS.maxTopicsPerMaterial),
        catch: () => new IndexingError({ reason: "la respuesta del modelo con los temas no se pudo interpretar" })
      });
    });

    return { indexMaterial };
  })
);
