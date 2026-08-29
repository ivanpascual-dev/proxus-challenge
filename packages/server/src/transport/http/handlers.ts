import { Effect, Layer, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  ArtifactTypeMismatch as ApiArtifactTypeMismatch,
  BlockNotFound as ApiBlockNotFound,
  MaterialNotFound as ApiMaterialNotFound,
  MaterialNotIndexed as ApiMaterialNotIndexed,
  MaterialStorageError as ApiMaterialStorageError,
  PageOutOfRange as ApiPageOutOfRange,
  ProxusApi
} from "@proxus/shared";
import { TutorChatService } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import {
  ArtifactRepository,
  type Artifact,
  type ArtifactRepositoryError
} from "../../domain/artifacts/artifact.ts";
import { NoteService } from "../../domain/artifacts/note-service.ts";
import { rewriteBlock } from "../../domain/artifacts/rewrite-block.ts";
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
  title: artifact.title,
  // Solo los apuntes lo llevan: la interfaz los coloca en su material (fase 2, decisiones 17 a 19).
  ...(artifact.kind === "note" ? { materialId: artifact.materialId } : {})
});

// 500 con cuerpo y motivo, nunca un orDie mudo (invariante 6, F2-08).
const artifactStorageError = (context: string) => (error: ArtifactRepositoryError) =>
  new ApiArtifactStorageError({
    message: `${context}: ${String("reason" in error ? error.reason : error._tag)}`
  });

const artifactNotFound = (id: string) =>
  new ApiArtifactNotFound({ artifactId: id, message: `No hay ningún artefacto con id ${id}.` });

export const ArtifactsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "artifacts",
  Effect.fn(function* (handlers) {
    const artifacts = yield* ArtifactRepository;
    const notes = yield* NoteService;
    const rateLimiter = yield* RateLimiter;

    return handlers
      .handle("list", ({ query }) => artifacts.listArtifacts({ kind: query.kind }).pipe(
        Effect.map((listing) => ({
          artifacts: listing.artifacts.map(artifactSummary),
          unreadable: listing.unreadable.map((file) => ({ fileName: file.fileName, reason: file.reason }))
        })),
        Effect.mapError(artifactStorageError("No se pudo listar los artefactos"))
      ))
      .handle("get", ({ params }) => artifacts.getArtifact(params.id).pipe(
        Effect.mapError((error): ApiArtifactNotFound | ApiArtifactStorageError => error._tag === "ArtifactNotFound"
          ? artifactNotFound(params.id)
          : artifactStorageError(`No se pudo leer el artefacto ${params.id}`)(error))
      ))
      .handle("submit", ({ params, payload }) => artifacts.submitAttempt({
        ...payload,
        artifactId: params.id
      }).pipe(
        Effect.flatMap((attempt) => artifacts.gradeAttempt(attempt.id)),
        Effect.mapError((error): ApiArtifactNotFound | ApiArtifactTypeMismatch | ApiArtifactStorageError => {
          switch (error._tag) {
            case "ArtifactNotFound":
              return artifactNotFound(params.id);
            case "ArtifactTypeMismatch":
              return new ApiArtifactTypeMismatch({
                artifactId: params.id,
                expected: error.expected,
                actual: error.actual,
                message: `El artefacto ${params.id} es de tipo ${error.actual}; se esperaba ${error.expected}.`
              });
            default:
              return artifactStorageError(`No se pudo calificar el intento de ${params.id}`)(error);
          }
        })
      ))
      .handle("saveNote", ({ params, payload }) => notes.saveNote(params.id, payload))
      // Reescribe un bloque con una llamada al modelo (decisión 7): solo el texto del bloque y su
      // fragmento cacheado (F2-17). No guarda: devuelve la propuesta y el alumno decide.
      .handle("rewriteBlock", ({ params, payload }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "messages");

        const artifact = yield* artifacts.getArtifact(params.id).pipe(
          Effect.mapError((error): ApiArtifactNotFound | ApiArtifactStorageError => error._tag === "ArtifactNotFound"
            ? artifactNotFound(params.id)
            : artifactStorageError(`No se pudo leer el artefacto ${params.id}`)(error))
        );

        const block = artifact.kind === "note"
          ? artifact.blocks.find((candidate) => candidate.id === params.blockId)
          : undefined;
        if (block === undefined) {
          return yield* new ApiBlockNotFound({
            blockId: params.blockId,
            message: `El apunte ${params.id} no tiene ningún bloque con id ${params.blockId}.`
          });
        }

        const excerpt = block.source === null ? null : block.source.excerpt;
        return yield* rewriteBlock({ markdown: block.markdown, excerpt }, payload.mode);
      }))
      .handle("deleteArtifact", ({ params }) => artifacts.deleteArtifact(params.id).pipe(
        Effect.mapError((error): ApiArtifactNotFound | ApiArtifactStorageError => error._tag === "ArtifactNotFound"
          ? artifactNotFound(params.id)
          : artifactStorageError(`No se pudo borrar el artefacto ${params.id}`)(error))
      ));
  })
);

export const HttpHandlersLive = Layer.mergeAll(
  TutorHttpHandlers,
  MaterialsHttpHandlers,
  ArtifactsHttpHandlers
);
