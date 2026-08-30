import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { ArtifactAttempt } from "../schemas/artifact.ts";
import { ActiveAttemptResponse, DisputeQuestionInput } from "../schemas/attempt-api.ts";
import { ArtifactStorageError } from "../errors/artifact-errors.ts";
import { AttemptNotFound, AttemptNotGraded, QuestionNotFound } from "../errors/assessment-errors.ts";

// Endpoints de intento que no cuelgan de una prueba concreta (§5.6). `/active` es lo que la interfaz
// pregunta al arrancar para volver a un examen tras una recarga.
export class AttemptsApi extends HttpApiGroup.make("attempts")
  .add(
    // Va antes que `/:attemptId` para que el router no trate "active" como un id.
    HttpApiEndpoint.get("active", "/active", {
      success: ActiveAttemptResponse,
      error: [ArtifactStorageError.pipe(HttpApiSchema.status(500))]
    }),
    HttpApiEndpoint.get("get", "/:attemptId", {
      params: { attemptId: Schema.String },
      success: ArtifactAttempt,
      error: [
        AttemptNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // "Esto sí lo dije": retira del perfil la corrección de esa pregunta abierta (§6.7, defensa 1).
    // La pregunta pasa a `disputed`: deja de mover el perfil, en ninguna dirección. No cambia la
    // nota mostrada.
    HttpApiEndpoint.post("dispute", "/:attemptId/dispute", {
      params: { attemptId: Schema.String },
      payload: DisputeQuestionInput,
      success: ArtifactAttempt,
      error: [
        AttemptNotFound.pipe(HttpApiSchema.status(404)),
        QuestionNotFound.pipe(HttpApiSchema.status(404)),
        AttemptNotGraded.pipe(HttpApiSchema.status(409)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    })
  )
  .prefix("/attempts")
{}
