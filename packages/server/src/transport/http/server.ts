import { Effect, Layer, Option, Queue, Schema, Stream } from "effect";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { createServer } from "node:http";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { LanguageModel } from "effect/unstable/ai";
import {
  LimitExceeded,
  MaterialIndexStreamEvent,
  NoteAlreadyExists,
  NoteGenerationStreamEvent,
  ProxusApi,
  RateLimited,
  TutorChatRequest,
  TutorChatStreamEvent
} from "@proxus/shared";
import {
  MaterialRepository,
  type MaterialIndexingFailed,
  type MaterialNotFound,
  type MaterialRepositoryError
} from "../../domain/materials/material.ts";
import { GeminiModel } from "../../domain/agents/gemini.ts";
import { TutorChatService, TutorChatServiceLive } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import { FileArtifactRepository } from "../../infra/artifacts/file-artifact-repository.ts";
import { NoteServiceLive } from "../../domain/artifacts/note-service.ts";
import { FileMaterialRepository } from "../../infra/materials/file-material-repository.ts";
import { FileMaterialIndexRepository } from "../../infra/materials/file-material-index-repository.ts";
import { PopplerPdfService } from "../../infra/materials/poppler-pdf-service.ts";
import { IndexingServiceLive } from "../../domain/materials/indexing-service.ts";
import { NoteGenerationService, NoteGenerationServiceLive } from "../../domain/artifacts/note-generation-service.ts";
import { checkChatRequestLimits } from "../../domain/limits/chat-limits.ts";
import { RateLimiter, layer as RateLimiterLive } from "../../domain/limits/rate-limiter.ts";
import { clientKey, HttpHandlersLive } from "./handlers.ts";

const ApiRoutes = HttpApiBuilder.layer(ProxusApi, {
  openapiPath: "/openapi.json"
}).pipe(
  Layer.provide(HttpHandlersLive)
);

const DocsRoute = HttpApiScalar.layer(ProxusApi, {
  path: "/docs"
});

const encoder = new TextEncoder();

const encodeNdjson = (event: TutorChatStreamEvent) =>
  encoder.encode(`${JSON.stringify(Schema.encodeSync(TutorChatStreamEvent)(event))}\n`);

const encodeLimitExceeded = Schema.encodeSync(LimitExceeded);
const encodeRateLimited = Schema.encodeSync(RateLimited);

const TutorStreamRoute = HttpRouter.add("POST", "/api/tutor/chat/stream", () =>
  Effect.gen(function* () {
    const input = yield* HttpServerRequest.schemaBodyJson(TutorChatRequest);

    const limitExceeded = checkChatRequestLimits(input);
    if (Option.isSome(limitExceeded)) {
      return yield* HttpServerResponse.json(encodeLimitExceeded(limitExceeded.value), { status: 400 });
    }

    const rateLimiter = yield* RateLimiter;
    const key = yield* clientKey;

    const rejected = yield* rateLimiter.check(key, "messages").pipe(
      Effect.andThen(() => rateLimiter.acquire(key)),
      Effect.as(Option.none<RateLimited>()),
      Effect.catchTag("RateLimited", (error) => Effect.succeed(Option.some(error)))
    );
    if (Option.isSome(rejected)) {
      return yield* HttpServerResponse.json(encodeRateLimited(rejected.value), { status: 429 });
    }

    const tutor = yield* TutorChatService;
    const languageModel = yield* LanguageModel.LanguageModel;
    const body = tutor.streamMessage(input, key).pipe(
      Stream.provideService(LanguageModel.LanguageModel, languageModel),
      Stream.map(encodeNdjson),
      Stream.ensuring(rateLimiter.release(key))
    );

    return HttpServerResponse.stream(body, {
      contentType: "application/x-ndjson",
      headers: {
        "cache-control": "no-cache",
        "x-accel-buffering": "no"
      }
    });
  })
);

const encodeIndexEvent = Schema.encodeSync(MaterialIndexStreamEvent);
const encodeIndexNdjson = (event: MaterialIndexStreamEvent) =>
  encoder.encode(`${JSON.stringify(encodeIndexEvent(event))}\n`);

const reindexErrorMessage = (
  error: MaterialNotFound | MaterialIndexingFailed | MaterialRepositoryError
): string => {
  switch (error._tag) {
    case "MaterialNotFound":
      return `No hay ningún material con id ${error.materialId}.`;
    case "MaterialIndexingFailed":
      return error.reason;
    case "MaterialRepositoryError":
      return `Error al leer el material: ${String(error.reason)}`;
  }
};

// Bajo demanda: la persona pulsa "Indexar" en la interfaz. Emite el progreso página a página como
// NDJSON, igual que el chat, y termina con un evento done (con el índice) o failed (con el motivo).
const MaterialIndexStreamRoute = HttpRouter.add("POST", "/api/materials/:id/index", () =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params;
    const id = params.id ?? "";

    const rateLimiter = yield* RateLimiter;
    const key = yield* clientKey;
    const rejected = yield* rateLimiter.check(key, "messages").pipe(
      Effect.as(Option.none<RateLimited>()),
      Effect.catchTag("RateLimited", (error) => Effect.succeed(Option.some(error)))
    );
    if (Option.isSome(rejected)) {
      return yield* HttpServerResponse.json(encodeRateLimited(rejected.value), { status: 429 });
    }

    const materials = yield* MaterialRepository;
    const languageModel = yield* LanguageModel.LanguageModel;

    const events = Stream.callback<MaterialIndexStreamEvent, never, LanguageModel.LanguageModel>((queue) =>
      materials.reindex(id, (progress) => Queue.offer(queue, {
        type: "progress" as const,
        page: progress.page,
        pageCount: progress.pageCount,
        message: progress.message
      }).pipe(Effect.asVoid)).pipe(
        Effect.matchEffect({
          onSuccess: (index) => Queue.offer(queue, { type: "done" as const, index }).pipe(Effect.asVoid),
          onFailure: (error) => Queue.offer(queue, {
            type: "failed" as const,
            message: reindexErrorMessage(error)
          }).pipe(Effect.asVoid)
        }),
        Effect.andThen(Queue.end(queue))
      )
    );

    const body = events.pipe(
      Stream.provideService(LanguageModel.LanguageModel, languageModel),
      Stream.map(encodeIndexNdjson)
    );

    return HttpServerResponse.stream(body, {
      contentType: "application/x-ndjson",
      headers: {
        "cache-control": "no-cache",
        "x-accel-buffering": "no"
      }
    });
  })
);

const encodeNoteAlreadyExists = Schema.encodeSync(NoteAlreadyExists);
const encodeNoteGenEvent = Schema.encodeSync(NoteGenerationStreamEvent);
const encodeNoteGenNdjson = (event: NoteGenerationStreamEvent) =>
  encoder.encode(`${JSON.stringify(encodeNoteGenEvent(event))}\n`);

const noteGenErrorMessage = (error: { readonly _tag: string; readonly reason?: string; readonly materialId?: string }): string =>
  error._tag === "MaterialAlreadyHasNote"
    ? `El material ${error.materialId} ya tiene un apunte. Bórralo desde la pestaña Apuntes para volver a generarlo.`
    : error.reason ?? "no se pudieron generar los apuntes";

// Bajo demanda: la persona pulsa "Crear apuntes" en la pestaña Apuntes del material. Genera un bloque
// por tema del índice, emite el progreso tema a tema como NDJSON, y termina con done (el resumen del
// apunte) o failed (el motivo). Mismo patrón que la indexación; no pasa por el tutor (fase 2, decisión 24).
const NoteGenerationRoute = HttpRouter.add("POST", "/api/materials/:id/notes", () =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params;
    const id = params.id ?? "";

    const rateLimiter = yield* RateLimiter;
    const key = yield* clientKey;
    // Genera un artefacto y hace una llamada al modelo por tema: cuenta contra el cubo `artifacts`
    // (más estricto que `messages`) y toma un permiso de concurrencia, igual que el chat, porque es
    // caro y no debe poder lanzarse en paralelo sin tope.
    const rejected = yield* rateLimiter.check(key, "artifacts").pipe(
      Effect.andThen(() => rateLimiter.acquire(key)),
      Effect.as(Option.none<RateLimited>()),
      Effect.catchTag("RateLimited", (error) => Effect.succeed(Option.some(error)))
    );
    if (Option.isSome(rejected)) {
      return yield* HttpServerResponse.json(encodeRateLimited(rejected.value), { status: 429 });
    }

    const noteGen = yield* NoteGenerationService;

    // El material ya tiene un apunte: es un conflicto, no un fallo de generación. Se responde 409
    // antes de abrir el stream (F2-34). El guardarraíl de carrera dentro de `forMaterial` sigue ahí
    // para la ventana estrecha entre esta comprobación y el guardado.
    const existingNote = yield* noteGen.existingNoteId(id).pipe(
      Effect.catchTag("NoteGenerationError", () => Effect.succeed(Option.none<string>()))
    );
    if (Option.isSome(existingNote)) {
      yield* rateLimiter.release(key);
      return yield* HttpServerResponse.json(
        encodeNoteAlreadyExists(new NoteAlreadyExists({
          materialId: id,
          noteId: existingNote.value,
          message: `El material ${id} ya tiene un apunte. Bórralo desde la pestaña Apuntes para volver a generarlo.`
        })),
        { status: 409 }
      );
    }

    const languageModel = yield* LanguageModel.LanguageModel;

    const events = Stream.callback<NoteGenerationStreamEvent, never, LanguageModel.LanguageModel>((queue) =>
      noteGen.forMaterial(id, (progress) => Queue.offer(queue, {
        type: "progress" as const,
        topic: progress.topic,
        topicCount: progress.topicCount,
        message: progress.message
      }).pipe(Effect.asVoid)).pipe(
        Effect.matchEffect({
          onSuccess: (note) => Queue.offer(queue, {
            type: "done" as const,
            note: { id: note.id, kind: "note" as const, title: note.title, materialId: note.materialId }
          }).pipe(Effect.asVoid),
          onFailure: (error) => Queue.offer(queue, {
            type: "failed" as const,
            message: noteGenErrorMessage(error)
          }).pipe(Effect.asVoid)
        }),
        Effect.andThen(Queue.end(queue))
      )
    );

    const body = events.pipe(
      Stream.provideService(LanguageModel.LanguageModel, languageModel),
      Stream.map(encodeNoteGenNdjson),
      Stream.ensuring(rateLimiter.release(key))
    );

    return HttpServerResponse.stream(body, {
      contentType: "application/x-ndjson",
      headers: {
        "cache-control": "no-cache",
        "x-accel-buffering": "no"
      }
    });
  })
);

const Routes = Layer.mergeAll(ApiRoutes, DocsRoute, TutorStreamRoute, MaterialIndexStreamRoute, NoteGenerationRoute);

const DomainLive = Layer.mergeAll(
  TutorChatServiceLive,
  GeminiModel,
  NoteServiceLive,
  NoteGenerationServiceLive
).pipe(
  Layer.provideMerge(RateLimiterLive())
);

const InfraLive = Layer.mergeAll(
  FileMaterialRepository.layer(".data/materials/pdfs").pipe(
    Layer.provide(PopplerPdfService.layer),
    Layer.provide(FileMaterialIndexRepository.layer(".data/materials/index")),
    Layer.provide(IndexingServiceLive.pipe(Layer.provide(PopplerPdfService.layer)))
  ),
  FileArtifactRepository.layer(".data/artifacts")
);

export const HttpServerLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(DomainLive),
  Layer.provide(InfraLive),
  Layer.provide(NodeHttpServer.layer(
    () => createServer(),
    { port: Number(process.env.PORT ?? "3000") }
  ))
);
