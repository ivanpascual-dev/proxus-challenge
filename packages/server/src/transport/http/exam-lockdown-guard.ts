import { Effect, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { ExamInProgress, ExamLockdownGuard } from "@proxus/shared";
import { ArtifactRepository } from "../../domain/artifacts/artifact.ts";
import { remainingSeconds } from "../../domain/artifacts/exam-clock.ts";
import {
  attemptIdFromPath,
  findActiveExam,
  isActiveAttemptOnlyRoute,
  isClosedRoute,
  type ActiveExam
} from "../../domain/artifacts/exam-lockdown.ts";

// La implementación de la puerta cerrada (decisión 18). El contrato (`ExamLockdownGuard` + su error
// `ExamInProgress` 409) vive en `packages/shared`; aquí va lo que sabe si hay un examen en curso.
// Envuelve los grupos `tutor`, `materials`, `artifacts` y `attempts`; la lista de qué cierra y qué
// deja abierto está en `domain/artifacts/exam-lockdown.ts` con su test de cobertura. Las cuatro rutas
// NDJSON sueltas (chat, indexar, apuntes, generar prueba) no pasan por `HttpApi`, así que llaman a
// `rawRouteLockdownRejection` a mano.
//
// El chequeo lee todos los intentos de disco, pero solo cuando la ruta está en la lista cerrada, y
// son ficheros pequeños acotados por los techos de §5.7 (como mucho ~180). No se cachea: un examen
// recién empezado tiene que cerrar la puerta al instante, y una caché con invalidación entre cuatro
// handlers era más complejidad de la que el ahorro justifica a esta escala.

// El examen en curso ahora mismo, leído de disco. Si ya venció, se cierra al mirarlo (§5.5). Si los
// intentos no se pueden leer, la puerta se abre (fail-open): mejor no encerrar al alumno por un fallo
// de disco. El motivo va al log.
const resolveActiveExam = (repository: ArtifactRepository) => Effect.gen(function* () {
  const attempts = yield* repository.listAttempts().pipe(
    Effect.catch((error) =>
      Effect.logWarning(`el guard del examen no pudo leer los intentos: ${String(error)}`).pipe(Effect.as([]))
    )
  );
  const active = findActiveExam(attempts, new Date().toISOString());
  if (active?.expired != null) {
    yield* repository.saveAttempt(active.expired).pipe(Effect.ignore);
    return null;
  }
  return active;
});

const rejection = (active: ActiveExam): ExamInProgress =>
  new ExamInProgress({
    attemptId: active.attempt.id,
    artifactId: active.attempt.artifactId,
    artifactKind: active.attempt.artifactKind,
    remainingSeconds: remainingSeconds(active.attempt, new Date().toISOString()),
    message: "Tienes un examen en curso. Entrégalo o cancélalo para volver al material, a los apuntes y al tutor."
  });

const pathnameOf = (url: string): string => {
  const queryAt = url.indexOf("?");
  return queryAt === -1 ? url : url.slice(0, queryAt);
};

// Entregar, cancelar y latir el examen EN CURSO siguen abiertos; para cualquier otro intento (una
// práctica a medias) van con el resto de la lista cerrada (§6.9.1).
const isActiveAttemptEscape = (method: string, pathname: string, active: ActiveExam): boolean =>
  isActiveAttemptOnlyRoute(method, pathname) && attemptIdFromPath(pathname) === active.attempt.id;

// Para las rutas NDJSON sueltas: devuelve el 409 ya formado si hay que cerrar, o `None`.
export const rawRouteLockdownRejection = (method: string, url: string) => Effect.gen(function* () {
  const pathname = pathnameOf(url);
  if (!isClosedRoute(method, pathname)) {
    return Option.none<ExamInProgress>();
  }
  const repository = yield* ArtifactRepository;
  const active = yield* resolveActiveExam(repository);
  return active === null ? Option.none<ExamInProgress>() : Option.some(rejection(active));
});

export const ExamLockdownGuardLive = Layer.effect(ExamLockdownGuard)(
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;

    return (handler) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const pathname = pathnameOf(request.url);
        const method = request.method;

        if (!isClosedRoute(method, pathname) && !isActiveAttemptOnlyRoute(method, pathname)) {
          return yield* handler;
        }

        const active = yield* resolveActiveExam(repository);
        if (active === null || isActiveAttemptEscape(method, pathname, active)) {
          return yield* handler;
        }

        return yield* rejection(active);
      });
  })
);
