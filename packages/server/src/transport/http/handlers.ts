import { Effect, Layer, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http";
import {
  MaterialNotFound as ApiMaterialNotFound,
  MaterialNotIndexed as ApiMaterialNotIndexed,
  MaterialStorageError as ApiMaterialStorageError,
  PageOutOfRange as ApiPageOutOfRange,
  ProxusApi
} from "@proxus/shared";
import { TutorChatService } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import { ArtifactRepository, type Artifact } from "../../domain/artifacts/artifact.ts";
import { MaterialRepository } from "../../domain/materials/material.ts";
import { checkChatRequestLimits } from "../../domain/limits/chat-limits.ts";
import { RateLimiter } from "../../domain/limits/rate-limiter.ts";

// Sin autenticación, la IP es lo único que hay: es un fusible, no una cerradura (ADR-007).
export const clientKey = HttpServerRequest.HttpServerRequest.pipe(
  Effect.map((request) => Option.getOrElse(request.remoteAddress, () => "unknown"))
);

export const TutorHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "tutor",
  Effect.fn(function* (handlers) {
    const tutor = yield* TutorChatService;
    const rateLimiter = yield* RateLimiter;

    return handlers.handle("chat", ({ payload }) =>
      Effect.gen(function* () {
        const limitExceeded = checkChatRequestLimits(payload);
        if (Option.isSome(limitExceeded)) {
          return yield* limitExceeded.value;
        }

        const key = yield* clientKey;
        yield* rateLimiter.check(key, "messages");
        yield* rateLimiter.acquire(key);

        return yield* tutor.sendMessage(payload, key).pipe(
          Effect.orDie,
          Effect.ensuring(rateLimiter.release(key))
        );
      })
    );
  })
);

const notFound = (materialId: string) =>
  new ApiMaterialNotFound({ materialId, message: `No hay ningún material con id ${materialId}.` });

const notIndexed = (materialId: string) =>
  new ApiMaterialNotIndexed({
    materialId,
    message: `El material ${materialId} no está indexado. Pulsa "Indexar" para construir su índice.`
  });

// El almacenamiento falló al leer. 500, pero con cuerpo y motivo: nada de orDie mudo (invariante 6).
const storageError = (materialId: string, reason: unknown) =>
  new ApiMaterialStorageError({
    materialId,
    message: `No se pudo leer el material ${materialId} del almacenamiento: ${String(reason)}`
  });

export const MaterialsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "materials",
  Effect.fn(function* (handlers) {
    const materials = yield* MaterialRepository;

    return handlers
      .handle("list", () => materials.list().pipe(
        Effect.map((items) => ({ materials: items })),
        Effect.orDie
      ))
      .handle("get", ({ params }) => materials.get(params.id).pipe(
        Effect.catchTag("MaterialRepositoryError", Effect.die),
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id)))
      ))
      .handle("index", ({ params }) => materials.getIndex(params.id).pipe(
        Effect.catchTag("MaterialRepositoryError", (error) => Effect.fail(storageError(params.id, error.reason))),
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id))),
        Effect.catchTag("MaterialNotIndexed", () => Effect.fail(notIndexed(params.id)))
      ))
      .handle("page", ({ params }) => Effect.gen(function* () {
        const material = yield* materials.get(params.id);
        if (!Number.isInteger(params.page) || params.page < 1 || params.page > material.pageCount) {
          return yield* new ApiPageOutOfRange({
            materialId: params.id,
            page: params.page,
            pageCount: material.pageCount,
            message: `El material ${params.id} tiene ${material.pageCount} páginas; ${params.page} está fuera de rango.`
          });
        }
        const { image } = yield* materials.renderPage(params.id, params.page);
        return image;
      }).pipe(
        Effect.catchTag("MaterialRepositoryError", (error) => Effect.fail(storageError(params.id, error.reason))),
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id)))
      ));
  })
);

const artifactSummary = (artifact: Artifact) => ({
  id: artifact.id,
  kind: artifact.kind,
  title: artifact.title
});

export const ArtifactsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "artifacts",
  Effect.fn(function* (handlers) {
    const artifacts = yield* ArtifactRepository;

    return handlers
      .handle("list", ({ query }) => artifacts.listArtifacts({ kind: query.kind }).pipe(
        Effect.map((items) => ({ artifacts: items.map(artifactSummary) })),
        Effect.orDie
      ))
      .handle("get", ({ params }) => artifacts.getArtifact(params.id).pipe(Effect.orDie))
      .handle("submit", ({ params, payload }) => artifacts.submitAttempt({
        ...payload,
        artifactId: params.id
      }).pipe(
        Effect.flatMap((attempt) => artifacts.gradeAttempt(attempt.id)),
        Effect.orDie
      ));
  })
);

export const HttpHandlersLive = Layer.mergeAll(
  TutorHttpHandlers,
  MaterialsHttpHandlers,
  ArtifactsHttpHandlers
);
