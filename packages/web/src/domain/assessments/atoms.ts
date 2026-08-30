import type { TestAnswer } from "@proxus/shared";
import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ApiClient } from "../../api-client/client.ts";
import { apiRuntime } from "../../lib/runtime.ts";

// Los Controles y Exámenes de un material, con su último intento: lo que la pestaña "Pruebas" pinta
// sin descargar cada prueba entera (§5.6). Se invalida cuando se genera una prueba nueva
// (`assessments`) o cuando cambia un intento (`attempts`).
export const materialAssessmentsQuery = Atom.family((materialId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.materials.assessments({ params: { id: materialId } })
      ).pipe(Effect.withSpan("materials.assessments", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity(["assessments", "attempts"]))
);

// La prueba SIN clave de respuesta (decisión 9). No cambia una vez generada: no lleva etiqueta de
// intento.
export const solvableAssessmentQuery = Atom.family((artifactId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.artifacts.solvable({ params: { id: artifactId } })
      ).pipe(Effect.withSpan("artifacts.solvable", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity(["assessments"]))
);

// El historial de una prueba: todos sus intentos, incluidos los abandonados con su motivo.
export const attemptHistoryQuery = Atom.family((artifactId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.artifacts.attemptHistory({ params: { id: artifactId } })
      ).pipe(Effect.withSpan("artifacts.attemptHistory", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity(["attempts"]))
);

// Un intento entero, por su id. Lo lee la vista de corrección tras entregar y "esto sí lo dije".
export const attemptQuery = Atom.family((attemptId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.attempts.get({ params: { attemptId } })
      ).pipe(Effect.withSpan("attempts.get", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity(["attempts"]))
);

// El examen en curso, si lo hay. La interfaz lo consulta al arrancar para volver a él tras una
// recarga (§6.11). El panel de examen a pantalla completa llega en el tramo 3C.
export const activeAttemptQuery = apiRuntime
  .atom(
    ApiClient.use((client) =>
      client.attempts.active()
    ).pipe(Effect.withSpan("attempts.active", { kind: "client" }))
  )
  .pipe(Atom.keepAlive, Atom.withReactivity(["attempts"]));

// Empezar un intento. El servidor pone `startedAt` con autoridad (decisión 8), deriva el modo del
// artefacto y comprueba el techo de intentos (decisión 22).
export const startAttemptAction = apiRuntime.fn(
  ({ artifactId }: { readonly artifactId: string }) =>
    ApiClient.use((client) =>
      client.artifacts.startAttempt({ params: { id: artifactId } })
    ).pipe(Effect.withSpan("artifacts.startAttempt", { kind: "client" })),
  { reactivityKeys: ["attempts", "assessments"] }
);

// Registrar que se abrió una pista y devolver su texto. Solo en práctica; si no se pudo registrar,
// el servidor no la sirve (§6.11, F3-14).
export const revealHintAction = apiRuntime.fn(
  ({ artifactId, attemptId, questionId }: {
    readonly artifactId: string;
    readonly attemptId: string;
    readonly questionId: string;
  }) =>
    ApiClient.use((client) =>
      client.artifacts.revealHint({ params: { id: artifactId, attemptId }, payload: { questionId } })
    ).pipe(Effect.withSpan("artifacts.revealHint", { kind: "client" })),
  { reactivityKeys: ["attempts"] }
);

// Entregar y corregir. En los dos modos la corrección sale aquí (F3-11, F3-19). Gasta llamadas al
// juez para el desarrollo corto.
export const submitAttemptAction = apiRuntime.fn(
  ({ artifactId, attemptId, answers }: {
    readonly artifactId: string;
    readonly attemptId: string;
    readonly answers: readonly TestAnswer[];
  }) =>
    ApiClient.use((client) =>
      client.artifacts.submitAttempt({ params: { id: artifactId, attemptId }, payload: { answers } })
    ).pipe(Effect.withSpan("artifacts.submitAttempt", { kind: "client" })),
  { reactivityKeys: ["attempts", "assessments"] }
);

// Cancelar el intento y abrir la puerta (decisión 19). Se guarda como `abandoned` y se ve en el
// historial; no mueve el perfil.
export const abandonAttemptAction = apiRuntime.fn(
  ({ artifactId, attemptId }: { readonly artifactId: string; readonly attemptId: string }) =>
    ApiClient.use((client) =>
      client.artifacts.abandonAttempt({ params: { id: artifactId, attemptId } })
    ).pipe(Effect.withSpan("artifacts.abandonAttempt", { kind: "client" })),
  { reactivityKeys: ["attempts", "assessments"] }
);

// "Esto sí lo dije": retira del perfil la corrección de esa pregunta abierta (§6.7, defensa 1). No
// cambia la nota mostrada.
export const disputeAction = apiRuntime.fn(
  ({ attemptId, questionId }: { readonly attemptId: string; readonly questionId: string }) =>
    ApiClient.use((client) =>
      client.attempts.dispute({ params: { attemptId }, payload: { questionId } })
    ).pipe(Effect.withSpan("attempts.dispute", { kind: "client" })),
  { reactivityKeys: ["attempts"] }
);
