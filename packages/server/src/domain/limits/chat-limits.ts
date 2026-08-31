import { Option } from "effect";
import { LIMITS, LimitExceeded } from "@proxus/shared";

// Fase 4, decisión 6: la sesión vive en el servidor y el historial ya no llega en la petición
// (cierra D3, ADR-008 barrera 3), así que `messages` dejó de tener algo que comprobar aquí. El
// techo sobre cuánto puede crecer una conversación guardada (`maxConversationHistoryTokens`) es
// `checkConversationHistoryLimit`, más abajo: necesita la sesión ya cargada, así que no es parte de
// esta comprobación de forma de la petición.
export interface ChatRequestLimitsInput {
  readonly input: string;
  readonly maxSteps?: number | undefined;
}

export const checkChatRequestLimits = (request: ChatRequestLimitsInput): Option.Option<LimitExceeded> => {
  if (request.maxSteps !== undefined) {
    // El techo es un número, pero también hay que exigir que sea un entero >= 1: `maxSteps: 12.9`
    // pasaría el `> 12` y el bucle de pasos (`session.ts`) correría 13 iteraciones, una llamada al
    // modelo por encima del techo. Un valor no entero o < 1 se rechaza en voz alta (invariante 11).
    const valid = Number.isInteger(request.maxSteps)
      && request.maxSteps >= 1
      && request.maxSteps <= LIMITS.maxAgentSteps;
    if (!valid) {
      return Option.some(new LimitExceeded({
        limit: "maxAgentSteps",
        ceiling: LIMITS.maxAgentSteps,
        received: request.maxSteps,
        message: `Los pasos por turno deben ser un número entero entre 1 y ${LIMITS.maxAgentSteps}, se pidieron ${request.maxSteps}.`
      }));
    }
  }

  if (request.input.length > LIMITS.maxMessageCharacters) {
    return Option.some(new LimitExceeded({
      limit: "maxMessageCharacters",
      ceiling: LIMITS.maxMessageCharacters,
      received: request.input.length,
      message: `El mensaje supera el máximo de ${LIMITS.maxMessageCharacters} caracteres (tiene ${request.input.length}).`
    }));
  }

  return Option.none();
};

// El fusible de coste sobre la conversación entera. `lastTurnInputTokens` es el dato REAL, medido,
// de `usageMetadata` del último paso del último turno guardado (nunca una estimación): sin ese dato
// (conversación nueva, o el modelo no lo trajo esa vez) no hay nada que comparar, así que no se
// rechaza (invariante 3: no se fabrica un cero ni un límite superado donde no hay dato).
export const checkConversationHistoryLimit = (lastTurnInputTokens: number | undefined): Option.Option<LimitExceeded> => {
  if (lastTurnInputTokens === undefined || lastTurnInputTokens < LIMITS.maxConversationHistoryTokens) {
    return Option.none();
  }

  return Option.some(new LimitExceeded({
    limit: "maxConversationHistoryTokens",
    ceiling: LIMITS.maxConversationHistoryTokens,
    received: lastTurnInputTokens,
    message: `Esta conversación ya pasa de los ${LIMITS.maxConversationHistoryTokens.toLocaleString("es")} tokens de historial. Empieza una conversación nueva para seguir.`
  }));
};

// El 75% del mismo techo: informativo, no rechaza el turno que ya se está completando. `undefined`
// mientras no haya un aviso que dar (mismo criterio que arriba: sin dato real, sin aviso).
const CONVERSATION_HISTORY_WARNING_RATIO = 0.75;

export const conversationHistoryWarning = (lastTurnInputTokens: number | undefined): string | undefined => {
  const threshold = LIMITS.maxConversationHistoryTokens * CONVERSATION_HISTORY_WARNING_RATIO;
  if (lastTurnInputTokens === undefined || lastTurnInputTokens < threshold) {
    return undefined;
  }

  return `Esta conversación se está haciendo larga (unos ${Math.round(lastTurnInputTokens / 1000).toLocaleString("es")} mil tokens de historial). Cuando puedas, empieza una nueva para que siga siendo rápida y barata.`;
};
