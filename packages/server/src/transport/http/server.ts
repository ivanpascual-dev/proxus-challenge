import { Effect, Layer, Option, Queue, Schema, Stream } from "effect";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { createServer } from "node:http";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi";
import { LanguageModel } from "effect/unstable/ai";
import {
  AssessmentGenerationStreamEvent,
  ExamInProgress,
  GenerateAssessmentInput,
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
import {
  GeminiIndexLanguageModelLive,
  GeminiJsonLanguageModelLive,
  GeminiJsonThinkingLanguageModelLive,
  GeminiModel,
  GeminiProseThinkingLanguageModelLive
} from "../../domain/agents/gemini.ts";
import { TutorChatService, TutorChatServiceLive } from "../../domain/agents/academic-tutor/tutor-chat-service.ts";
import { FileArtifactRepository } from "../../infra/artifacts/file-artifact-repository.ts";
import { NoteServiceLive } from "../../domain/artifacts/note-service.ts";
import { FileMaterialRepository } from "../../infra/materials/file-material-repository.ts";
import { FileMaterialIndexRepository } from "../../infra/materials/file-material-index-repository.ts";
import { PopplerPdfService } from "../../infra/materials/poppler-pdf-service.ts";
import { IndexingServiceLive } from "../../domain/materials/indexing-service.ts";
import { NoteGenerationService, NoteGenerationServiceLive } from "../../domain/artifacts/note-generation-service.ts";
import { MaterialDeletionServiceLive } from "../../domain/materials/material-deletion-service.ts";
import {
  AssessmentGenerationService,
  AssessmentGenerationServiceLive,
  summarizeAssessment
} from "../../domain/artifacts/assessment-generation-service.ts";
import { AttemptServiceLive } from "../../domain/artifacts/attempt-service.ts";
import { OpenAnswerJudgeLive } from "../../domain/artifacts/open-answer-judge.ts";
import { StudyProfileServiceLive } from "../../domain/profile/study-profile.ts";
import { FileStudyProfileRepository } from "../../infra/profile/file-study-profile-repository.ts";
import { FileSessionRepository } from "../../infra/agents/file-session-repository.ts";
import { checkChatRequestLimits } from "../../domain/limits/chat-limits.ts";
import { RateLimiter, layer as RateLimiterLive } from "../../domain/limits/rate-limiter.ts";
import { clientKey, HttpHandlersLive } from "./handlers.ts";
import { ExamLockdownGuardLive, rawRouteLockdownRejection } from "./exam-lockdown-guard.ts";
import { MultipartLimitGuardLive } from "./multipart-limit-guard.ts";

const ApiRoutes = HttpApiBuilder.layer(ProxusApi, {
  openapiPath: "/openapi.json"
}).pipe(
  Layer.provide(HttpHandlersLive),
  Layer.provide(ExamLockdownGuardLive),
  Layer.provide(MultipartLimitGuardLive)
);

const DocsRoute = HttpApiScalar.layer(ProxusApi, {
  path: "/docs"
});

const encoder = new TextEncoder();

const encodeNdjson = (event: TutorChatStreamEvent) =>
  encoder.encode(`${JSON.stringify(Schema.encodeSync(TutorChatStreamEvent)(event))}\n`);

const encodeLimitExceeded = Schema.encodeSync(LimitExceeded);
const encodeRateLimited = Schema.encodeSync(RateLimited);
const encodeExamInProgress = Schema.encodeSync(ExamInProgress);

// La puerta cerrada del examen (decisión 18) para las rutas NDJSON sueltas: no pasan por `HttpApi`,
// así que el middleware `ExamLockdownGuard` no las cubre y comprueban a mano. Sale como JSON con
// `message` antes de abrir el stream, igual que `RateLimited`.
const examLockdownCheck = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* rawRouteLockdownRejection(request.method, request.url);
});

const TutorStreamRoute = HttpRouter.add("POST", "/api/tutor/chat/stream", () =>
  Effect.gen(function* () {
    const locked = yield* examLockdownCheck;
    if (Option.isSome(locked)) {
      return yield* HttpServerResponse.json(encodeExamInProgress(locked.value), { status: 409 });
    }

    // F4-11/F4-12: la sesión vive en el servidor, así que un cliente no puede mandar historial
    // fabricado. `onExcessProperty: "error"` es lo que convierte un campo no declarado (por ejemplo
    // `messages`) en un 400, en vez de decodificar en silencio ignorándolo (invariante 3).
    const input = yield* HttpServerRequest.schemaBodyJson(TutorChatRequest, { onExcessProperty: "error" });

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
      // El motivo crudo (ruta, error de disco) no le sirve al usuario y es detalle interno.
      return "No se pudo cargar el material. Vuelve a intentarlo en un momento.";
  }
};

// Bajo demanda: la persona pulsa "Indexar" en la interfaz. Emite el progreso página a página como
// NDJSON, igual que el chat, y termina con un evento done (con el índice) o failed (con el motivo).
const MaterialIndexStreamRoute = HttpRouter.add("POST", "/api/materials/:id/index", () =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params;
    const id = params.id ?? "";

    const locked = yield* examLockdownCheck;
    if (Option.isSome(locked)) {
      return yield* HttpServerResponse.json(encodeExamInProgress(locked.value), { status: 409 });
    }

    const rateLimiter = yield* RateLimiter;
    const key = yield* clientKey;
    // La gracia de alta (fase 4, decisión 4): la primera indexación de un material recién subido no
    // cobra su cubo, porque subir ya se cobró contra `uploadsPerWindow`.
    const hasGrace = yield* rateLimiter.hasUploadGrace(id);
    const rejected = yield* (hasGrace ? Effect.succeed(Option.none<RateLimited>()) : rateLimiter.check(key, "messages").pipe(
      Effect.as(Option.none<RateLimited>()),
      Effect.catchTag("RateLimited", (error) => Effect.succeed(Option.some(error)))
    ));
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
      Stream.map(encodeIndexNdjson),
      // Renueva la gracia al cerrar el stream (ADR-028): un indexado largo no debe consumir la
      // ventana antes de que el cliente lance, justo después, la generación de apuntes.
      Stream.ensuring(hasGrace ? rateLimiter.grantUploadGrace(id) : Effect.void)
    );

    return HttpServerResponse.stream(body, {
      contentType: "application/x-ndjson",
      headers: {
        "cache-control": "no-cache",
        "x-accel-buffering": "no"
      }
    });
  }).pipe(Effect.provide(GeminiIndexLanguageModelLive))
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

    const locked = yield* examLockdownCheck;
    if (Option.isSome(locked)) {
      return yield* HttpServerResponse.json(encodeExamInProgress(locked.value), { status: 409 });
    }

    const rateLimiter = yield* RateLimiter;
    const key = yield* clientKey;
    // Genera un artefacto y hace una llamada al modelo por tema: cuenta contra el cubo `artifacts`
    // (más estricto que `messages`) y toma un permiso de concurrencia, igual que el chat, porque es
    // caro y no debe poder lanzarse en paralelo sin tope. La gracia de alta (ADR-028) exime de las DOS
    // barreras, no solo del cubo de frecuencia, cuando es la preparación automática de un material
    // recién subido: ya se cobró al decidir subir.
    const hasGrace = yield* rateLimiter.hasUploadGrace(id);
    const usesConcurrencyPermit = !hasGrace;
    const rejected = yield* (hasGrace ? Effect.void : rateLimiter.check(key, "artifacts")).pipe(
      Effect.andThen(() => usesConcurrencyPermit ? rateLimiter.acquire(key) : Effect.void),
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
      if (usesConcurrencyPermit) {
        yield* rateLimiter.release(key);
      }
      if (hasGrace) {
        yield* rateLimiter.revokeUploadGrace(id);
      }
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
      // Libera el permiso de concurrencia si lo tomó, y revoca la gracia si la tenía (ADR-028), en
      // éxito y en fallo: la gracia no debe seguir viva más allá de esta preparación automática.
      Stream.ensuring(Effect.gen(function* () {
        if (usesConcurrencyPermit) {
          yield* rateLimiter.release(key);
        }
        if (hasGrace) {
          yield* rateLimiter.revokeUploadGrace(id);
        }
      }))
    );

    return HttpServerResponse.stream(body, {
      contentType: "application/x-ndjson",
      headers: {
        "cache-control": "no-cache",
        "x-accel-buffering": "no"
      }
    });
  }).pipe(Effect.provide(GeminiProseThinkingLanguageModelLive))
);

const encodeAssessmentGenEvent = Schema.encodeSync(AssessmentGenerationStreamEvent);
const encodeAssessmentGenNdjson = (event: AssessmentGenerationStreamEvent) =>
  encoder.encode(`${JSON.stringify(encodeAssessmentGenEvent(event))}\n`);

// Bajo demanda: la persona pulsa "Control de este tema" o "Examen del material" en la pestaña
// Pruebas. El código pone la forma (cuántas preguntas de cada tipo, sobre qué tema, con qué cita), el
// modelo redacta, y `question-parse` filtra sin rellenar. Emite el progreso tema a tema como NDJSON y
// termina con done (el resumen de la prueba) o failed (el motivo). Mismo patrón que la generación de
// apuntes; usa la capa del adaptador en modo JSON (§6.7.1), proveída solo aquí.
const AssessmentGenerationRoute = HttpRouter.add("POST", "/api/materials/:id/assessments", () =>
  Effect.gen(function* () {
    const params = yield* HttpRouter.params;
    const id = params.id ?? "";

    const locked = yield* examLockdownCheck;
    if (Option.isSome(locked)) {
      return yield* HttpServerResponse.json(encodeExamInProgress(locked.value), { status: 409 });
    }

    const request = yield* HttpServerRequest.schemaBodyJson(GenerateAssessmentInput).pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    if (request === null) {
      return yield* HttpServerResponse.json(
        { message: "El cuerpo de la petición no tiene el formato esperado (kind, topicId, origin, questionCount)." },
        { status: 400 }
      );
    }

    const rateLimiter = yield* RateLimiter;
    const key = yield* clientKey;
    // Genera un artefacto y una llamada al modelo por tema: cuenta contra el cubo `artifacts` y toma
    // un permiso de concurrencia, como el chat y los apuntes.
    const rejected = yield* rateLimiter.check(key, "artifacts").pipe(
      Effect.andThen(() => rateLimiter.acquire(key)),
      Effect.as(Option.none<RateLimited>()),
      Effect.catchTag("RateLimited", (error) => Effect.succeed(Option.some(error)))
    );
    if (Option.isSome(rejected)) {
      return yield* HttpServerResponse.json(encodeRateLimited(rejected.value), { status: 429 });
    }

    const assessmentGen = yield* AssessmentGenerationService;

    // Precondiciones comprobadas ANTES de abrir el stream (§6.9): material inexistente, sin indexar,
    // techo de pruebas. Salen como JSON con `message`, no como un `failed` a mitad.
    const rejection = yield* assessmentGen.precheck(id, request);
    if (Option.isSome(rejection)) {
      yield* rateLimiter.release(key);
      return yield* HttpServerResponse.json({ message: rejection.value.message }, { status: rejection.value.status });
    }

    // La capa elegida según `request.kind` (§4.2): Examen lleva el pensamiento decidido en el tramo
    // 4G (paso 21); Control se queda sin pensar (decisión 14, es el camino de más volumen).
    const generationLayer = request.kind === "test" ? GeminiJsonThinkingLanguageModelLive : GeminiJsonLanguageModelLive;
    const languageModel = yield* LanguageModel.LanguageModel.pipe(Effect.provide(generationLayer));

    const events = Stream.callback<AssessmentGenerationStreamEvent, never, LanguageModel.LanguageModel>((queue) =>
      assessmentGen.forMaterial(id, request, (progress) => Queue.offer(queue, {
        type: "progress" as const,
        topic: progress.topic,
        topicCount: progress.topicCount,
        message: progress.message
      }).pipe(Effect.asVoid)).pipe(
        Effect.matchEffect({
          onSuccess: (result) => Queue.offer(queue, {
            type: "done" as const,
            assessment: summarizeAssessment(result.artifact),
            questionCount: result.questionCount,
            retries: result.retries
          }).pipe(Effect.asVoid),
          onFailure: (error) => Queue.offer(queue, {
            type: "failed" as const,
            message: error.reason
          }).pipe(Effect.asVoid)
        }),
        Effect.andThen(Queue.end(queue))
      )
    );

    const body = events.pipe(
      Stream.provideService(LanguageModel.LanguageModel, languageModel),
      Stream.map(encodeAssessmentGenNdjson),
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

const Routes = Layer.mergeAll(
  ApiRoutes,
  DocsRoute,
  TutorStreamRoute,
  MaterialIndexStreamRoute,
  NoteGenerationRoute,
  AssessmentGenerationRoute
);

const DomainLive = Layer.mergeAll(
  TutorChatServiceLive,
  GeminiModel,
  NoteServiceLive,
  NoteGenerationServiceLive,
  MaterialDeletionServiceLive,
  AssessmentGenerationServiceLive,
  AttemptServiceLive.pipe(Layer.provide(OpenAnswerJudgeLive))
).pipe(
  // El perfil de estudio lo usan el `AttemptService` (al entregar y al discrepar) y el handler de
  // `GET /materials/:id/profile`: se provee a los dos con `provideMerge` y queda en la salida.
  Layer.provideMerge(StudyProfileServiceLive),
  Layer.provideMerge(RateLimiterLive())
);

const InfraLive = Layer.mergeAll(
  FileMaterialRepository.layer(".data/materials/pdfs").pipe(
    Layer.provide(PopplerPdfService.layer),
    Layer.provide(FileMaterialIndexRepository.layer(".data/materials/index")),
    Layer.provide(IndexingServiceLive.pipe(Layer.provide(PopplerPdfService.layer)))
  ),
  FileArtifactRepository.layer(".data/artifacts"),
  FileStudyProfileRepository.layer(".data/profile"),
  FileSessionRepository.layer(".data/agent-sessions")
);

export const HttpServerLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(DomainLive),
  Layer.provide(InfraLive),
  Layer.provide(NodeHttpServer.layer(
    () => createServer(),
    { port: Number(process.env.PORT ?? "3000") }
  ))
);
