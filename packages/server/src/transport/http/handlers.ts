import { Effect, Layer, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  BlockNotFound as ApiBlockNotFound,
  MaterialNotFound as ApiMaterialNotFound,
  MaterialNotIndexed as ApiMaterialNotIndexed,
  MaterialStorageError as ApiMaterialStorageError,
  PageOutOfRange as ApiPageOutOfRange,
  ProxusApi
} from "@proxus/shared";
import { TutorChatService } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import { GeminiJsonLanguageModelLive } from "../../domain/agents/gemini.ts";
import {
  ArtifactRepository,
  type Artifact,
  type ArtifactRepositoryError
} from "../../domain/artifacts/artifact.ts";
import { NoteService } from "../../domain/artifacts/note-service.ts";
import { AttemptService, buildAssessmentListEntry } from "../../domain/artifacts/attempt-service.ts";
import { rewriteBlock } from "../../domain/artifacts/rewrite-block.ts";
import { fetchUrlSource } from "../../domain/artifacts/url-source.ts";
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

// El almacenamiento falló al leer. 500 con cuerpo (nada de orDie mudo, invariante 6), pero el
// mensaje que ve el usuario dice qué falló, no cómo: el motivo técnico (SchemaError, ruta del
// fichero, `_tag`) es fuga de detalle interno y no le sirve de nada. El detalle va al log del
// servidor en el punto donde se produce (`file-*-repository.ts`, `logAndFailStorage`).
const storageError = (materialId: string) =>
  new ApiMaterialStorageError({
    materialId,
    message: `No se pudo cargar el material "${materialId}". Vuelve a intentarlo en un momento.`
  });

// Deja el motivo técnico en el log del servidor y falla con el error limpio del contrato.
const logAndFailStorage = (materialId: string, reason: unknown) =>
  Effect.logWarning(`fallo de almacenamiento de materiales (${materialId}): ${String(reason)}`).pipe(
    Effect.andThen(Effect.fail(storageError(materialId)))
  );

export const MaterialsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "materials",
  Effect.fn(function* (handlers) {
    const materials = yield* MaterialRepository;
    const artifacts = yield* ArtifactRepository;

    return handlers
      .handle("list", () => materials.list().pipe(
        Effect.map((items) => ({ materials: items })),
        Effect.orDie
      ))
      // Controles y Exámenes del material, con su último intento (§5.6). Verifica que el material
      // existe; la prueba anclada a un material sin índice es un caso del riesgo 5, no un error aquí.
      .handle("assessments", ({ params }) => Effect.gen(function* () {
        yield* materials.get(params.id).pipe(
          Effect.catchTag("MaterialRepositoryError", (error) => logAndFailStorage(params.id, error.reason)),
          Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id)))
        );
        const listing = yield* artifacts.listArtifacts().pipe(
          Effect.mapError(() => storageError(params.id))
        );
        const attempts = yield* artifacts.listAttempts().pipe(
          Effect.mapError(() => storageError(params.id))
        );
        const own = listing.artifacts.filter(
          (artifact): artifact is Extract<Artifact, { kind: "quiz" | "test" }> =>
            (artifact.kind === "quiz" || artifact.kind === "test") && artifact.scope.materialId === params.id
        );
        return {
          assessments: own
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((artifact) => buildAssessmentListEntry(artifact, attempts))
        };
      }))
      .handle("get", ({ params }) => materials.get(params.id).pipe(
        Effect.catchTag("MaterialRepositoryError", Effect.die),
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id)))
      ))
      .handle("index", ({ params }) => materials.getIndex(params.id).pipe(
        Effect.catchTag("MaterialRepositoryError", (error) => logAndFailStorage(params.id, error.reason)),
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
        Effect.catchTag("MaterialRepositoryError", (error) => logAndFailStorage(params.id, error.reason)),
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id)))
      ));
  })
);

const artifactSummary = (artifact: Artifact) => ({
  id: artifact.id,
  kind: artifact.kind,
  title: artifact.title,
  // El apunte lleva su `materialId` desde la fase 2; los Controles y Exámenes lo llevan dentro del
  // alcance, más lo que la pestaña Pruebas necesita para pintar la lista sin descargar cada prueba
  // entera (§5.4).
  ...(artifact.kind === "note"
    ? { materialId: artifact.materialId }
    : {
        materialId: artifact.scope.materialId,
        createdAt: artifact.createdAt,
        scope: artifact.scope,
        origin: artifact.origin,
        questionCount: artifact.questions.length
      })
});

// 500 con cuerpo, nunca un orDie mudo (invariante 6, F2-08). El mensaje al usuario dice qué falló,
// no cómo: el motivo crudo (ruta del fichero, SchemaError, `_tag`) es fuga de detalle interno. Los
// listados registran cada fichero ilegible en el log del servidor (`file-artifact-repository.ts`).
const artifactStorageError = (context: string) => (_error: ArtifactRepositoryError) =>
  new ApiArtifactStorageError({
    message: `${context}. Vuelve a intentarlo en un momento.`
  });

const artifactNotFound = (id: string) =>
  new ApiArtifactNotFound({ artifactId: id, message: `No hay ningún artefacto con id ${id}.` });

export const ArtifactsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "artifacts",
  Effect.fn(function* (handlers) {
    const artifacts = yield* ArtifactRepository;
    const notes = yield* NoteService;
    const attempts = yield* AttemptService;
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
      // La prueba SIN clave de respuesta (decisión 9). Lo que se sirve mientras se resuelve.
      .handle("solvable", ({ params }) => attempts.solvable(params.id))
      // Empezar un intento. El modo lo deriva el servicio del artefacto. El techo
      // (`maxPracticeAttemptsPerAssessment` / `maxExamAttemptsPerAssessment`) cuenta también los
      // cancelados y caducados (decisión 22).
      .handle("startAttempt", ({ params }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "artifacts");
        return yield* attempts.start(params.id);
      }))
      // Registrar que se abrió una pista y devolver su texto (solo en práctica, decisión 10).
      .handle("revealHint", ({ params, payload }) => attempts.revealHint(params.id, params.attemptId, payload.questionId))
      // Entregar y corregir. Gasta llamadas al juez: cuenta contra el cubo `artifacts` y toma un
      // permiso de concurrencia. La capa JSON del adaptador se provee solo aquí.
      .handle("submitAttempt", ({ params, payload }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "artifacts");
        yield* rateLimiter.acquire(key);
        return yield* attempts.submit(params.id, params.attemptId, payload.answers).pipe(
          Effect.provide(GeminiJsonLanguageModelLive),
          Effect.ensuring(rateLimiter.release(key))
        );
      }))
      // Cancelar el intento y abrir la puerta (decisión 19).
      .handle("abandonAttempt", ({ params }) => attempts.abandon(params.attemptId, "cancelled"))
      // El historial de una prueba: todos sus intentos, con los abandonados y su motivo.
      .handle("attemptHistory", ({ params }) => attempts.history(params.id).pipe(Effect.map((list) => [...list])))
      // Escribe el apunte entero (hasta ~1 MB con los techos de bloque). No es una operación cara ni
      // destructiva (el último que guarda manda, por diseño), pero pasa por el fusible de frecuencia
      // para que no se pueda martillear: cubo de mensajes, holgado para una sesión de edición.
      .handle("saveNote", ({ params, payload }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "messages");
        return yield* notes.saveNote(params.id, payload);
      }))
      // Reescribe un bloque con una llamada al modelo (decisión 7): solo el texto del bloque y su
      // fragmento cacheado (F2-17). No guarda: devuelve la propuesta y el alumno decide.
      .handle("rewriteBlock", ({ params, payload }) => Effect.gen(function* () {
        const key = yield* clientKey;
        // Gasta una llamada al modelo: cuenta contra el cubo de mensajes y toma un permiso de
        // concurrencia, para que `maxConcurrentRequests` acote también estas puertas (igual que el
        // chat y la generación de apuntes).
        yield* rateLimiter.check(key, "messages");
        yield* rateLimiter.acquire(key);

        return yield* Effect.gen(function* () {
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
        }).pipe(Effect.ensuring(rateLimiter.release(key)));
      }))
      // Trae una URL. Las siete guardas viven en el dominio (`url-source`); aquí el fusible: sale a la
      // red y hace hasta dos llamadas al modelo, así que cuenta contra el cubo `artifacts` (más
      // estricto) y toma un permiso de concurrencia, igual que la generación de apuntes.
      .handle("fetchUrlSource", ({ payload }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "artifacts");
        yield* rateLimiter.acquire(key);
        return yield* fetchUrlSource(payload.url).pipe(Effect.ensuring(rateLimiter.release(key)));
      }))
      // El alumno acepta o descarta una propuesta del tutor (ADR-014). El servicio devuelve ya los
      // errores del contrato (`ProposalStale` 409 con los dos textos, F2-29), así que el handler no
      // mapea nada: no hay `orDie` que valga (invariante 6).
      .handle("acceptProposal", ({ params }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "messages");
        return yield* notes.acceptProposal(params.id, params.proposalId);
      }))
      .handle("rejectProposal", ({ params }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "messages");
        return yield* notes.rejectProposal(params.id, params.proposalId);
      }))
      // Borrado: la única operación destructiva por HTTP de la fase 2. Cubo `artifacts` (más
      // estricto): borrar cinco artefactos cada diez minutos sobra para rehacer un apunte.
      .handle("deleteArtifact", ({ params }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "artifacts");
        return yield* artifacts.deleteArtifact(params.id).pipe(
          Effect.mapError((error): ApiArtifactNotFound | ApiArtifactStorageError => error._tag === "ArtifactNotFound"
            ? artifactNotFound(params.id)
            : artifactStorageError(`No se pudo borrar el artefacto ${params.id}`)(error))
        );
      }));
  })
);

export const AttemptsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "attempts",
  Effect.fn(function* (handlers) {
    const attempts = yield* AttemptService;

    return handlers
      // Lo que la interfaz pregunta al arrancar para volver a un examen tras una recarga (§6.11).
      .handle("active", () => attempts.activeExam())
      .handle("get", ({ params }) => attempts.get(params.attemptId))
      // El latido del examen (decisión 19c): acumula tiempo conectado y devuelve el que queda.
      .handle("heartbeat", ({ params }) => attempts.heartbeat(params.attemptId))
      // "Esto sí lo dije" (§6.7, defensa 1): la pregunta pasa a `disputed` y deja de mover el perfil.
      .handle("dispute", ({ params, payload }) => attempts.dispute(params.attemptId, payload.questionId));
  })
);

export const HttpHandlersLive = Layer.mergeAll(
  TutorHttpHandlers,
  MaterialsHttpHandlers,
  ArtifactsHttpHandlers,
  AttemptsHttpHandlers
);
