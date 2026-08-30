import { HttpApiMiddleware, HttpApiSchema } from "effect/unstable/httpapi";
import { ExamInProgress } from "../errors/assessment-errors.ts";

// La puerta cerrada del examen (decisión 18), como middleware de `HttpApi`. Se aplica a los grupos
// `tutor`, `materials`, `artifacts` y `attempts`; su implementación (que sabe si hay un examen en
// curso) vive en el servidor (`transport/http/exam-lockdown-guard.ts`). La lista de rutas que cierra
// y las que deja abiertas viven en un solo sitio, `server/domain/artifacts/exam-lockdown.ts`, con su
// test de cobertura.
//
// El error va declarado: `ExamInProgress` 409 con el intento, el tiempo que queda y la frase de
// salida (entregarlo o cancelarlo). Nada de `Effect.orDie` (invariante 6).
export class ExamLockdownGuard extends HttpApiMiddleware.Service<ExamLockdownGuard>()(
  "ExamLockdownGuard",
  {
    error: ExamInProgress.pipe(HttpApiSchema.status(409))
  }
) {}
