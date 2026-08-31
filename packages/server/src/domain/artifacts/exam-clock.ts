import { LIMITS } from "@proxus/shared";
import type { AbandonedAttempt, AttemptInterruption, InProgressAttempt } from "./artifact.ts";

// El reloj de tiempo conectado del examen (decisión 19c), puro. El reloj cuenta el tiempo que estás
// conectado, no el de pared: el latido va acumulando `connectedSeconds` y el hueco en que no estabas
// no cuenta y se guarda en `interruptions`. Sin esto, "retómalo dentro de dos horas" y "tienes 40
// minutos" se contradicen. Aquí vive el riesgo silencioso: un reloj mal calculado no lanza nada.

const secondsBetween = (fromIso: string, toIso: string): number =>
  Math.max(0, (Date.parse(toIso) - Date.parse(fromIso)) / 1000);

// El resultado de aplicar un latido: los tres campos del intento que el reloj toca.
export interface ClockStep {
  readonly connectedSeconds: number;
  readonly lastHeartbeatAt: string;
  readonly interruptions: readonly AttemptInterruption[];
}

// El tramo desde el último latido (o desde `startedAt` si es el primero) hasta `now`. Si es más corto
// que el umbral de interrupción, el alumno siguió conectado y cuenta entero. Si es más largo, hubo un
// hueco: el tramo NO cuenta y se registra como interrupción.
export const applyHeartbeat = (attempt: InProgressAttempt, nowIso: string): ClockStep => {
  const since = attempt.lastHeartbeatAt ?? attempt.startedAt;
  const gapSeconds = secondsBetween(since, nowIso);
  const isInterruption = gapSeconds * 1000 > LIMITS.examInterruptionThresholdMs;

  return {
    connectedSeconds: isInterruption ? attempt.connectedSeconds : attempt.connectedSeconds + gapSeconds,
    lastHeartbeatAt: nowIso,
    interruptions: isInterruption
      ? [...attempt.interruptions, { from: since, to: nowIso }]
      : attempt.interruptions
  };
};

// El tiempo conectado ahora mismo, sin persistir: `connectedSeconds` más el tramo capado desde el
// último latido. Lo usan la comprobación de caducidad y el rechazo por tiempo de la entrega, para que
// una entrega justo en el límite se juzgue con lo que de verdad ha pasado.
export const connectedSecondsNow = (attempt: InProgressAttempt, nowIso: string): number => {
  const since = attempt.lastHeartbeatAt ?? attempt.startedAt;
  const gapSeconds = secondsBetween(since, nowIso);
  const counted = gapSeconds * 1000 > LIMITS.examInterruptionThresholdMs ? 0 : gapSeconds;
  return attempt.connectedSeconds + counted;
};

// Segundos que quedan de examen. `0` si el intento no tiene límite (no debería: solo el modo examen
// llega aquí) o si ya se agotó.
export const remainingSeconds = (attempt: InProgressAttempt, nowIso: string): number => {
  if (attempt.timeLimitSeconds === null) {
    return 0;
  }
  return Math.max(0, attempt.timeLimitSeconds - connectedSecondsNow(attempt, nowIso));
};

// Un examen `in-progress` está vivo mientras su tiempo conectado no alcance el límite. Cuando lo
// alcanza, caduca: quien llama lo cierra como `abandoned` con motivo `expired`. La caducidad se
// resuelve AL MIRARLA, sin proceso de fondo (§5.5).
export const isExpired = (attempt: InProgressAttempt, nowIso: string): boolean =>
  attempt.timeLimitSeconds !== null && connectedSecondsNow(attempt, nowIso) >= attempt.timeLimitSeconds;

export const expire = (attempt: InProgressAttempt, nowIso: string): AbandonedAttempt => ({
  ...attempt,
  status: "abandoned",
  reason: "expired",
  abandonedAt: nowIso
});
