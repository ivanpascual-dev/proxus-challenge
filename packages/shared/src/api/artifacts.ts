import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Artifact, ArtifactAttempt, ArtifactListResponse } from "../schemas/artifact.ts";
import {
  RevealHintInput,
  RevealHintResult,
  SolvableAssessment,
  StartAttemptInput,
  SubmitAttemptAnswersInput
} from "../schemas/attempt-api.ts";
import {
  FetchUrlSourceInput,
  RewriteBlockInput,
  RewrittenBlock,
  SaveNoteInput,
  UrlSourceResult
} from "../schemas/note.ts";
import {
  ArtifactNotFound,
  ArtifactStorageError,
  ArtifactTypeMismatch,
  BlockNotFound,
  NoteLimitExceeded,
  ProposalNotFound,
  ProposalStale,
  RewriteFailed,
  UnknownBlock,
  UrlFetchFailed,
  UrlRejected
} from "../errors/artifact-errors.ts";
import {
  AttemptAlreadyClosed,
  AttemptLimitExceeded,
  AttemptNotFound,
  HintNotAvailable,
  TimeLimitExceeded
} from "../errors/assessment-errors.ts";
import { RateLimited } from "../errors/limit-exceeded.ts";
import { ExamLockdownGuard } from "./exam-lockdown.ts";

const ArtifactKindQuery = Schema.Struct({
  kind: Schema.optional(Schema.Union([
    Schema.Literal("note"),
    Schema.Literal("quiz"),
    Schema.Literal("test")
  ]))
});

export class ArtifactsApi extends HttpApiGroup.make("artifacts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: ArtifactKindQuery,
      success: ArtifactListResponse,
      error: [ArtifactStorageError.pipe(HttpApiSchema.status(500))]
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: {
        id: Schema.String
      },
      success: Artifact,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // La prueba SIN clave de respuesta (decisión 9): se sirve mientras se resuelve. Ni
    // `correctOptionId`, ni `expectedAnswer`, ni rúbrica, ni explicación, ni el texto de la pista.
    HttpApiEndpoint.get("solvable", "/:id/solvable", {
      params: { id: Schema.String },
      success: SolvableAssessment,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // El intento se crea en el servidor al empezarlo (decisión 8): da `startedAt` con autoridad.
    HttpApiEndpoint.post("startAttempt", "/:id/attempts", {
      params: { id: Schema.String },
      payload: StartAttemptInput,
      success: ArtifactAttempt,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        AttemptLimitExceeded.pipe(HttpApiSchema.status(400)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Registrar que se abrió una pista y devolver su texto. Solo en modo práctica: en examen el
    // endpoint la rechaza (decisión 10). Si no se pudo registrar, no se sirve (§6.11).
    HttpApiEndpoint.post("revealHint", "/:id/attempts/:attemptId/hint", {
      params: { id: Schema.String, attemptId: Schema.String },
      payload: RevealHintInput,
      success: RevealHintResult,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        AttemptNotFound.pipe(HttpApiSchema.status(404)),
        AttemptAlreadyClosed.pipe(HttpApiSchema.status(409)),
        HintNotAvailable.pipe(HttpApiSchema.status(409)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Entregar y corregir. El juez corrige el desarrollo corto; la aritmética la hace el código.
    HttpApiEndpoint.post("submitAttempt", "/:id/attempts/:attemptId/submit", {
      params: { id: Schema.String, attemptId: Schema.String },
      payload: SubmitAttemptAnswersInput,
      success: ArtifactAttempt,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        AttemptNotFound.pipe(HttpApiSchema.status(404)),
        AttemptAlreadyClosed.pipe(HttpApiSchema.status(409)),
        TimeLimitExceeded.pipe(HttpApiSchema.status(409)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Cancelar el intento y abrir la puerta (decisión 19). Se guarda como `abandoned` y se ve en el
    // historial; no mueve el perfil (decisión 22).
    HttpApiEndpoint.post("abandonAttempt", "/:id/attempts/:attemptId/abandon", {
      params: { id: Schema.String, attemptId: Schema.String },
      success: ArtifactAttempt,
      error: [
        AttemptNotFound.pipe(HttpApiSchema.status(404)),
        AttemptAlreadyClosed.pipe(HttpApiSchema.status(409)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // El historial de una prueba: todos sus intentos, incluidos los abandonados con su motivo.
    HttpApiEndpoint.get("attemptHistory", "/:id/attempts", {
      params: { id: Schema.String },
      success: Schema.Array(ArtifactAttempt),
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Un solo endpoint de escritura para el apunte: editar, añadir, reordenar, borrar y marcar son la
    // misma operación (decisión 3). Se manda la nota entera; el último que guarda manda.
    HttpApiEndpoint.put("saveNote", "/:id/note", {
      params: {
        id: Schema.String
      },
      payload: SaveNoteInput,
      success: Artifact,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        NoteLimitExceeded.pipe(HttpApiSchema.status(400)),
        UnknownBlock.pipe(HttpApiSchema.status(400)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Reescribir un bloque: manda al modelo solo el texto del bloque y su fragmento cacheado
    // (F2-17), devuelve la propuesta y no guarda nada (decisión 8). Cuenta contra el cubo de
    // mensajes porque gasta una llamada al modelo.
    HttpApiEndpoint.post("rewriteBlock", "/:id/blocks/:blockId/rewrite", {
      params: {
        id: Schema.String,
        blockId: Schema.String
      },
      payload: RewriteBlockInput,
      success: RewrittenBlock,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        BlockNotFound.pipe(HttpApiSchema.status(404)),
        RewriteFailed.pipe(HttpApiSchema.status(502)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Traer una URL como fuente de un bloque. Las siete guardas de §4.7 viven en el servidor;
    // `UrlRejected` nombra la que falló. Redirección: se rechaza, no se sigue (decisión 9).
    HttpApiEndpoint.post("fetchUrlSource", "/url-source", {
      payload: FetchUrlSourceInput,
      success: UrlSourceResult,
      error: [
        UrlRejected.pipe(HttpApiSchema.status(400)),
        UrlFetchFailed.pipe(HttpApiSchema.status(502)),
        RateLimited.pipe(HttpApiSchema.status(429))
      ]
    }),
    // El tutor propone (insert, replace, remove) con `artifacts note propose`; nunca aplica. El
    // alumno acepta o descarta desde la interfaz (ADR-014). La confirmación está en el código de la
    // forma más fuerte: el agente no tiene ningún comando que acepte una propuesta (F2-27).
    // Al aceptar, si el bloque cambió desde que el tutor lo vio, `ProposalStale` 409 con los dos
    // textos (F2-29).
    HttpApiEndpoint.post("acceptProposal", "/:id/proposals/:proposalId/accept", {
      params: {
        id: Schema.String,
        proposalId: Schema.String
      },
      success: Artifact,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        ProposalNotFound.pipe(HttpApiSchema.status(404)),
        ProposalStale.pipe(HttpApiSchema.status(409)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    HttpApiEndpoint.post("rejectProposal", "/:id/proposals/:proposalId/reject", {
      params: {
        id: Schema.String,
        proposalId: Schema.String
      },
      success: Artifact,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        ProposalNotFound.pipe(HttpApiSchema.status(404)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Borrar un apunte para poder regenerarlo: un material tiene como mucho un apunte (fase 2,
    // decisión 19), así que sin borrado no habría forma de rehacerlo.
    HttpApiEndpoint.delete("deleteArtifact", "/:id", {
      params: {
        id: Schema.String
      },
      success: HttpApiSchema.NoContent,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    })
  )
  .middleware(ExamLockdownGuard)
  .prefix("/artifacts")
{}
