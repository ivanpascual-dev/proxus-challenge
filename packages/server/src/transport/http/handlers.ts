import { Effect, Layer, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest } from "effect/unstable/http";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  BlockNotFound as ApiBlockNotFound,
  LIMITS,
  LimitExceeded,
  MaterialAlreadyExists as ApiMaterialAlreadyExists,
  MaterialNotFound as ApiMaterialNotFound,
  MaterialNotIndexed as ApiMaterialNotIndexed,
  MaterialStorageError as ApiMaterialStorageError,
  PageOutOfRange as ApiPageOutOfRange,
  ProxusApi,
  TooManyMaterials as ApiTooManyMaterials,
  UnsupportedFileType as ApiUnsupportedFileType,
  type MaterialUploadResult,
  type MaterialValidationResult
} from "@proxus/shared";
import { TutorChatService } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import { GeminiJudgeLanguageModelLive } from "../../domain/agents/gemini.ts";
import {
  ArtifactRepository,
  type Artifact,
  type ArtifactRepositoryError
} from "../../domain/artifacts/artifact.ts";
import { deleteArtifactCascade } from "../../domain/artifacts/artifact-deletion.ts";
import { NoteService } from "../../domain/artifacts/note-service.ts";
import { AttemptService, buildAssessmentListEntry } from "../../domain/artifacts/attempt-service.ts";
import { assessmentShortfall } from "../../domain/artifacts/assessment-shortfall.ts";
import { StudyProfileService } from "../../domain/profile/study-profile.ts";
import { rewriteBlock } from "../../domain/artifacts/rewrite-block.ts";
import { fetchUrlSource } from "../../domain/artifacts/url-source.ts";
import {
  MaterialRepository,
  type MaterialUploadOutcome,
  type MaterialValidationOutcome
} from "../../domain/materials/material.ts";
import { MaterialDeletionService } from "../../domain/materials/material-deletion-service.ts";
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

    return handlers
      .handle("chat", ({ payload }) =>
        Effect.gen(function* () {
          const limitExceeded = checkChatRequestLimits(payload);
          if (Option.isSome(limitExceeded)) {
            return yield* limitExceeded.value;
          }

          const key = yield* clientKey;
          yield* rateLimiter.check(key, "messages");
          yield* rateLimiter.acquire(key);

          return yield* tutor.sendMessage(payload, key).pipe(
            Effect.ensuring(rateLimiter.release(key))
          );
        })
      )
      .handle("listConversations", () => tutor.listConversations())
      .handle("createConversation", () => tutor.createConversation())
      .handle("getConversation", ({ params }) => tutor.getConversation(params.id))
      .handle("deleteConversation", ({ params }) => tutor.deleteConversation(params.id));
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

// El rechazo por fichero, del domain (`UnsupportedFileType` / `MaterialAlreadyExists`) al del
// contrato, compartido entre `upload` (que sí escribió) y `validate` (que solo miró).
const toApiRejectionReason = (
  reason: Extract<MaterialUploadOutcome, { readonly outcome: "rejected" }>["reason"],
  verb: "subir" | "validar"
) =>
  reason._tag === "UnsupportedFileType"
    ? new ApiUnsupportedFileType({
        fileName: reason.fileName,
        message: `"${reason.fileName}" no se pudo ${verb}: ${reason.reason}`
      })
    : new ApiMaterialAlreadyExists({
        fileName: reason.fileName,
        materialId: reason.materialId,
        message: `Ya hay un material con el nombre "${reason.fileName}". Bórralo antes de volver a subirlo.`
      });

// `maxParts` en el contrato lleva un fichero de holgura sobre `maxFilesPerUpload` (ver el comentario
// en `packages/shared/src/api/materials.ts`): el parser de multipart de esta beta trunca en silencio
// un lote por encima de su techo en vez de rechazarlo, así que el rechazo en voz alta (F4-03) tiene
// que hacerlo este código, con el número de ficheros que de verdad llegó.
const checkFileCount = (received: number) =>
  received > LIMITS.maxFilesPerUpload
    ? Effect.fail(new LimitExceeded({
        limit: "maxFilesPerUpload",
        ceiling: LIMITS.maxFilesPerUpload,
        received,
        message: `Como mucho se pueden subir ${LIMITS.maxFilesPerUpload} ficheros a la vez, se han enviado ${received}.`
      }))
    : Effect.void;

// El resultado de la subida, por fichero: el domain trae sus propios `UnsupportedFileType` /
// `MaterialAlreadyExists`, y aquí se traducen a los del contrato (mismo patrón que `notFound` /
// `storageError` arriba para el resto de errores de materiales).
const toApiUploadResult = (outcome: MaterialUploadOutcome): MaterialUploadResult => {
  if (outcome.outcome === "created") {
    return { fileName: outcome.fileName, outcome: "created", material: outcome.material };
  }
  return { fileName: outcome.fileName, outcome: "rejected", reason: toApiRejectionReason(outcome.reason, "subir") };
};

// El mismo mapeo que `toApiUploadResult`, para el resultado de `validate` (sin `material`: nada se
// creó).
const toApiValidationResult = (outcome: MaterialValidationOutcome): MaterialValidationResult => {
  if (outcome.outcome === "valid") {
    return { fileName: outcome.fileName, outcome: "valid" };
  }
  return { fileName: outcome.fileName, outcome: "rejected", reason: toApiRejectionReason(outcome.reason, "validar") };
};

export const MaterialsHttpHandlers = HttpApiBuilder.group(
  ProxusApi,
  "materials",
  Effect.fn(function* (handlers) {
    const materials = yield* MaterialRepository;
    const artifacts = yield* ArtifactRepository;
    const profile = yield* StudyProfileService;
    const rateLimiter = yield* RateLimiter;
    const deletion = yield* MaterialDeletionService;

    return handlers
      .handle("list", () => materials.list().pipe(
        Effect.map((items) => ({ materials: items })),
        Effect.orDie
      ))
      // Sube un lote de PDFs (decisión 2: solo PDF). Frecuencia primero (fusible propio,
      // `uploadsPerWindow`), después `maxMaterials` agregado dentro de `materials.upload`, que
      // aborta antes de escribir nada; los rechazos por fichero (tipo, nombre duplicado) viajan
      // dentro de la respuesta 200 (F4-02). Cada material creado abre su gracia de alta (decisión 4):
      // su primera indexación y su primera generación de apuntes no cobran el cubo `artifacts`.
      .handle("upload", ({ payload }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.checkUpload(key);
        yield* checkFileCount(payload.files.length);

        const candidates = payload.files.map((file) => ({ fileName: file.name, path: file.path }));

        const outcomes = yield* materials.upload(candidates).pipe(
          Effect.catchTag("MaterialRepositoryError", (error) => Effect.logWarning(
            `fallo de almacenamiento en la subida: ${String(error.reason)}`
          ).pipe(
            Effect.andThen(Effect.fail(new ApiMaterialStorageError({
              materialId: "upload",
              message: "No se pudo completar la subida. Vuelve a intentarlo en un momento."
            })))
          )),
          Effect.catchTag("TooManyMaterials", (error) => Effect.fail(new ApiTooManyMaterials({
            limit: error.limit,
            existing: error.existing,
            requested: error.requested,
            message: `Puedes tener hasta ${error.limit} materiales y ya tienes ${error.existing}. Borra alguno antes de subir ${error.requested} más.`
          })))
        );

        yield* Effect.forEach(
          outcomes,
          (outcome) => outcome.outcome === "created" ? rateLimiter.grantUploadGrace(outcome.material.id) : Effect.void,
          { discard: true }
        );

        return { results: outcomes.map(toApiUploadResult) };
      }))
      // Comprueba un lote de PDFs sin escribir nada (F4-02 en modo consulta): la interfaz lo llama al
      // soltar los ficheros, antes de ofrecer el botón "Subir". Sin `checkUpload`: no cuenta contra el
      // techo de subidas reales.
      .handle("validate", ({ payload }) => Effect.gen(function* () {
        yield* checkFileCount(payload.files.length);

        const candidates = payload.files.map((file) => ({ fileName: file.name, path: file.path }));

        const outcomes = yield* materials.validate(candidates).pipe(
          Effect.catchTag("MaterialRepositoryError", (error) => Effect.logWarning(
            `fallo de almacenamiento al validar una subida: ${String(error.reason)}`
          ).pipe(
            Effect.andThen(Effect.fail(new ApiMaterialStorageError({
              materialId: "validate",
              message: "No se pudieron comprobar los ficheros. Vuelve a intentarlo en un momento."
            })))
          ))
        );

        return { results: outcomes.map(toApiValidationResult) };
      }))
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
      // El perfil de estudio del material, tema a tema, con las señales por separado (§5.6, ADR-002).
      .handle("profile", ({ params }) => profile.read(params.id).pipe(
        Effect.catchTag("StudyProfileError", (error) => Effect.fail(
          error.notFound ? notFound(params.id) : storageError(params.id)
        ))
      ))
      .handle("get", ({ params }) => materials.get(params.id).pipe(
        Effect.catchTag("MaterialRepositoryError", Effect.die),
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id)))
      ))
      // Borra el PDF y sus artefactos (apunte, controles, exámenes). Mismo cubo `artifacts` que
      // `deleteArtifact`: es la única otra operación destructiva por HTTP, y el mismo margen sobra.
      .handle("remove", ({ params }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "artifacts");
        return yield* deletion.remove(params.id);
      }).pipe(
        Effect.catchTag("MaterialNotFound", () => Effect.fail(notFound(params.id))),
        Effect.catchTag("MaterialDeletionError", (error) => logAndFailStorage(params.id, error.reason))
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

const artifactSummary = (artifact: Artifact) => {
  // El apunte lleva su `materialId` desde la fase 2; los Controles y Exámenes lo llevan dentro del
  // alcance, más lo que la pestaña Pruebas necesita para pintar la lista sin descargar cada prueba
  // entera (§5.4).
  if (artifact.kind === "note") {
    return { id: artifact.id, kind: artifact.kind, title: artifact.title, materialId: artifact.materialId };
  }
  // `requestedQuestionCount` solo cuando la prueba salió parcial (correcciones de cierre de fase 5,
  // decisión 10): ausente si coincide con `questionCount` o si el artefacto es anterior al corte.
  const shortfall = assessmentShortfall(artifact);
  return {
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    materialId: artifact.scope.materialId,
    createdAt: artifact.createdAt,
    scope: artifact.scope,
    origin: artifact.origin,
    questionCount: artifact.questions.length,
    ...(shortfall ? { requestedQuestionCount: shortfall.requested } : {})
  };
};

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
      // cancelados y caducados (decisión 22). No gasta el cubo `artifacts`: no hay llamada a la IA
      // hasta que se entrega (`submitAttempt`), y solo si hay desarrollo corto que corregir.
      .handle("startAttempt", ({ params }) => attempts.start(params.id))
      // Registrar que se abrió una pista y devolver su texto (solo en práctica, decisión 10).
      .handle("revealHint", ({ params, payload }) => attempts.revealHint(params.id, params.attemptId, payload.questionId))
      // Entregar y corregir. Solo gasta el cubo `artifacts` y un permiso de concurrencia cuando de
      // verdad va a llamar al juez, es decir, si hay algún desarrollo corto no vacío que corregir: una
      // prueba de solo opción múltiple/verdadero-falso no usa IA y no debe contar contra el cupo. La
      // capa del juez (`GeminiJudgeLanguageModelLive`, §4.2, tramo 4G) se provee siempre, la use o no.
      .handle("submitAttempt", ({ params, payload }) => Effect.gen(function* () {
        const needsJudge = payload.answers.some(
          (answer) => answer.questionType === "short-answer" && answer.answer.trim().length > 0
        );
        const key = yield* clientKey;
        if (needsJudge) {
          yield* rateLimiter.check(key, "artifacts");
          yield* rateLimiter.acquire(key);
        }
        return yield* attempts.submit(params.id, params.attemptId, payload.answers).pipe(
          Effect.provide(GeminiJudgeLanguageModelLive),
          Effect.ensuring(needsJudge ? rateLimiter.release(key) : Effect.void)
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
      // estricto): borrar cinco artefactos cada diez minutos sobra para rehacer un apunte. La cascada
      // de intentos vive en `artifact-deletion.ts`.
      .handle("deleteArtifact", ({ params }) => Effect.gen(function* () {
        const key = yield* clientKey;
        yield* rateLimiter.check(key, "artifacts");
        return yield* deleteArtifactCascade(artifacts, params.id).pipe(
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
