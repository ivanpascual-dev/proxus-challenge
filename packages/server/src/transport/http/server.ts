import { Effect, Layer, Option, Queue, Schema, Stream } from "effect";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { createServer } from "node:http";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { LanguageModel } from "effect/unstable/ai";
import {
  LimitExceeded,
  MaterialIndexStreamEvent,
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
import { FileMaterialRepository } from "../../infra/materials/file-material-repository.ts";
import { FileMaterialIndexRepository } from "../../infra/materials/file-material-index-repository.ts";
import { PopplerPdfService } from "../../infra/materials/poppler-pdf-service.ts";
import { IndexingServiceLive } from "../../domain/materials/indexing-service.ts";
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

const Routes = Layer.mergeAll(ApiRoutes, DocsRoute, TutorStreamRoute, MaterialIndexStreamRoute);

const DomainLive = Layer.mergeAll(
  TutorChatServiceLive,
  GeminiModel
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
