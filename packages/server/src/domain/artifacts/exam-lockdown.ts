import type { AbandonedAttempt, ArtifactAttempt, InProgressAttempt } from "./artifact.ts";
import { expire, isExpired } from "./exam-clock.ts";

// La puerta cerrada (decisión 18), en un solo sitio para que no haya dos listas que diverjan (§6.9.1).
// Todo aquí es puro: la decisión de si hay un examen activo (y el cierre del caducado), y la
// clasificación de rutas. El reloj de tiempo conectado vive en `exam-clock.ts`; quien escribe en
// disco es `attempt-service.ts`; quien envuelve las rutas en HTTP es el `ExamLockdownGuard`.

// --- ¿Hay un examen activo? -------------------------------------------------------------------
// El examen en modo examen que sigue `in-progress`. `null` si no hay ninguno o si el único que había
// ya caducó (y entonces `expired` lo trae para cerrarlo). Es la misma función la que decide si hay
// examen activo y la que cierra el caducado, así que no puede haber una puerta cerrada por un intento
// que otro trozo de código ya daba por muerto.
export interface ActiveExam {
  readonly attempt: InProgressAttempt;
  readonly expired: AbandonedAttempt | null;
}

export const findActiveExam = (attempts: readonly ArtifactAttempt[], nowIso: string): ActiveExam | null => {
  const inProgress = attempts.find(
    (candidate): candidate is InProgressAttempt =>
      candidate.status === "in-progress" && candidate.mode === "exam"
  );
  if (inProgress === undefined) {
    return null;
  }
  return isExpired(inProgress, nowIso)
    ? { attempt: inProgress, expired: expire(inProgress, nowIso) }
    : { attempt: inProgress, expired: null };
};

// --- La clasificación de rutas (§6.9.1) ---------------------------------------------------------
// Cada ruta está en la lista cerrada o en la abierta. El test de cobertura recorre TODAS las rutas
// (los endpoints de `ProxusApi` más las cuatro rutas NDJSON sueltas) y falla si alguna no está en
// ninguna de las dos, o está en las dos. Sin eso, la fase 4 añade la subida de ficheros y deja una
// rendija sin que nadie se entere. El id de ruta es `${METHOD} ${path}` con el `:param` del contrato.

// Mientras dura el examen, la aplicación ES el examen: se cierra todo lo que da acceso al material,
// a los apuntes, a otras pruebas o al tutor (decisión 18).
export const CLOSED_ROUTES: readonly string[] = [
  "POST /api/tutor/chat",
  "POST /api/tutor/chat/stream",
  // Conversaciones del tutor (fase 4, decisión 6): son acceso al tutor tanto como el propio chat, así
  // que se cierran con él.
  "GET /api/tutor/conversations",
  "POST /api/tutor/conversations",
  "GET /api/tutor/conversations/:id",
  "DELETE /api/tutor/conversations/:id",
  // Subir un material nuevo (fase 4) da acceso a material que no estaba en el examen: se cierra igual
  // que el resto de rutas que tocan materiales. Validar antes de subir es el mismo camino en modo
  // consulta (cierre de fase 4): abrirlo dejaría comprobar ficheros de fuera durante el examen aunque
  // no llegaran a crearse.
  "POST /api/materials",
  "POST /api/materials/validate",
  // Borrar un material se lleva sus artefactos (fase 4): tanto acceso a material como el propio
  // borrado de artefactos, así que se cierra por las dos razones a la vez.
  "DELETE /api/materials/:id",
  "GET /api/materials/:id",
  "GET /api/materials/:id/index",
  "GET /api/materials/:id/assessments",
  "GET /api/materials/:id/profile",
  "GET /api/materials/:id/pages/:page",
  "POST /api/materials/:id/index",
  "POST /api/materials/:id/notes",
  "POST /api/materials/:id/assessments",
  "GET /api/artifacts",
  "GET /api/artifacts/:id",
  "GET /api/artifacts/:id/attempts",
  "POST /api/artifacts/:id/attempts",
  "POST /api/artifacts/:id/attempts/:attemptId/hint",
  "PUT /api/artifacts/:id/note",
  "POST /api/artifacts/:id/blocks/:blockId/rewrite",
  "POST /api/artifacts/url-source",
  "POST /api/artifacts/:id/proposals/:proposalId/accept",
  "POST /api/artifacts/:id/proposals/:proposalId/reject",
  "DELETE /api/artifacts/:id",
  "POST /api/attempts/:attemptId/dispute"
];

// Siguen abiertas: el andamio de la aplicación (la lista de materiales), la prueba SIN clave que se
// está resolviendo, leer un intento, y entregar / cancelar / latir DEL INTENTO ACTIVO. Más
// `GET /api/attempts/active`, que es lo que la interfaz pregunta al arrancar para volver a su examen
// y es la llave de la puerta cerrada (decisión 19d).
export const OPEN_ROUTES: readonly string[] = [
  "GET /api/materials",
  "GET /api/artifacts/:id/solvable",
  "POST /api/artifacts/:id/attempts/:attemptId/submit",
  "POST /api/artifacts/:id/attempts/:attemptId/abandon",
  "GET /api/attempts/active",
  "GET /api/attempts/:attemptId",
  "POST /api/attempts/:attemptId/heartbeat"
];

// Las tres rutas de mutación de intento que están abiertas SOLO para el intento activo: entregar,
// cancelar y latir el examen en curso. Para cualquier otro intento (una práctica a medias) van con el
// resto de la lista cerrada (§6.9.1).
export const ACTIVE_ATTEMPT_ONLY_ROUTES: readonly string[] = [
  "POST /api/artifacts/:id/attempts/:attemptId/submit",
  "POST /api/artifacts/:id/attempts/:attemptId/abandon",
  "POST /api/attempts/:attemptId/heartbeat"
];

const routeToRegExp = (route: string): RegExp => {
  const [method, path] = route.split(" ", 2) as [string, string];
  const pattern = path
    .replace(/[.]/g, "\\.")
    .replace(/:[a-zA-Z]+/g, "[^/]+")
    .replace(/\//g, "\\/");
  return new RegExp(`^${method}\\s${pattern}$`);
};

const CLOSED_MATCHERS = CLOSED_ROUTES.map(routeToRegExp);
const ACTIVE_ONLY_MATCHERS = ACTIVE_ATTEMPT_ONLY_ROUTES.map(routeToRegExp);

// ¿Esta petición concreta (`GET /api/artifacts/abc`) cae en la lista cerrada?
export const isClosedRoute = (method: string, pathname: string): boolean => {
  const key = `${method.toUpperCase()} ${pathname}`;
  return CLOSED_MATCHERS.some((matcher) => matcher.test(key));
};

// ¿Es una de las tres rutas abiertas solo para el intento activo?
export const isActiveAttemptOnlyRoute = (method: string, pathname: string): boolean => {
  const key = `${method.toUpperCase()} ${pathname}`;
  return ACTIVE_ONLY_MATCHERS.some((matcher) => matcher.test(key));
};

// En las tres rutas de `ACTIVE_ATTEMPT_ONLY_ROUTES` el `attemptId` es el penúltimo segmento
// (`.../attempts/<attemptId>/submit`, `.../attempts/<attemptId>/heartbeat`).
export const attemptIdFromPath = (pathname: string): string | null => {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 2] ?? null;
};
