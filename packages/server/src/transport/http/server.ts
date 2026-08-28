import { Effect, Layer, Option, Schema, Stream } from "effect";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { createServer } from "node:http";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { LanguageModel } from "effect/unstable/ai";
import { LimitExceeded, ProxusApi, RateLimited, TutorChatRequest, TutorChatStreamEvent } from "@proxus/shared";
import { GeminiModel } from "../../domain/agents/gemini.ts";
import { TutorChatService, TutorChatServiceLive } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import { FileArtifactRepository } from "../../infra/artifacts/file-artifact-repository.ts";
import { FileMaterialRepository } from "../../infra/materials/file-material-repository.ts";
import { PopplerPdfService } from "../../infra/materials/poppler-pdf-service.ts";
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

const Routes = Layer.mergeAll(ApiRoutes, DocsRoute, TutorStreamRoute);

const DomainLive = Layer.mergeAll(
  TutorChatServiceLive,
  GeminiModel
).pipe(
  Layer.provideMerge(RateLimiterLive())
);

const InfraLive = Layer.mergeAll(
  FileMaterialRepository.layer(".data/materials/pdfs").pipe(
    Layer.provide(PopplerPdfService.layer)
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
