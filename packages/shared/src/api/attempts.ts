import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { ArtifactAttempt } from "../schemas/artifact.ts";
import { ActiveAttemptResponse, DisputeQuestionInput, HeartbeatResponse } from "../schemas/attempt-api.ts";
import { ArtifactStorageError } from "../errors/artifact-errors.ts";
import {
  AttemptAlreadyClosed,
  AttemptNotFound,
  AttemptNotGraded,
  QuestionNotFound
} from "../errors/assessment-errors.ts";
import { ExamLockdownGuard } from "./exam-lockdown.ts";

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
    // El latido del examen (decisión 19c): acumula el tiempo conectado, cierra el hueco de
    // interrupción si venía de uno, y devuelve el tiempo que queda. El reloj de pared no cuenta; el
    // hueco en que no estabas, tampoco. No cancela nada: si el tiempo conectado se agotó, el intento
    // ya está `abandoned` cuando el latido lo mira.
    HttpApiEndpoint.post("heartbeat", "/:attemptId/heartbeat", {
      params: { attemptId: Schema.String },
      success: HeartbeatResponse,
      error: [
        AttemptNotFound.pipe(HttpApiSchema.status(404)),
        AttemptAlreadyClosed.pipe(HttpApiSchema.status(409)),
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
  .middleware(ExamLockdownGuard)
  .prefix("/attempts")
{}
