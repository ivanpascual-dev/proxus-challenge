import type { AgentMessage, ChatContextRef, Conversation, ConversationSource } from "@proxus/shared";

// Fase 5, §4.4: un turno agrupa su actividad antes de la respuesta final. `TurnView` es la forma que
// consume `MessageList`/`AgentActivity`, tanto para un turno ya cerrado (reconstruido desde
// `Conversation`) como para el turno en curso (construido a partir de los eventos de streaming con las
// funciones puras de más abajo). El emparejamiento de herramienta y resultado es secuencial (decisión
// §4.4: "cada tool-call se asocia al siguiente tool-result pendiente"), nunca por nombre ni por id.

export interface ActivityCall {
  readonly name: string;
  readonly input: unknown;
  readonly result: unknown;
  readonly isFailure: boolean;
  // false mientras no ha llegado su tool-result: "No hay resultado disponible", nunca un éxito o un
  // resultado inventado (§4.4).
  readonly hasResult: boolean;
}

export type TurnStatus = "running" | "success" | "failure";

export interface TurnView {
  readonly key: string;
  readonly input: string;
  readonly context: readonly ChatContextRef[];
  readonly calls: readonly ActivityCall[];
  readonly assistantText: string | null;
  readonly followUpQuestions: readonly string[];
  readonly status: TurnStatus;
  readonly errorMessage: string | null;
  // Fase 5, §5.3: los materiales que el agente consultó de verdad en este turno. Llegan del servidor,
  // ya validados y deduplicados: el cliente nunca las deduce del Markdown de la respuesta.
  readonly sources: readonly ConversationSource[];
}

const pendingCall = (name: string, input: unknown): ActivityCall => ({
  name,
  input,
  result: undefined,
  isFailure: false,
  hasResult: false
});

const groupCalls = (messages: readonly AgentMessage[]): readonly ActivityCall[] => {
  const calls: ActivityCall[] = [];
  const pendingIndices: number[] = [];

  for (const message of messages) {
    if (message.role === "tool-call") {
      calls.push(pendingCall(message.name, message.input));
      pendingIndices.push(calls.length - 1);
      continue;
    }
    if (message.role === "tool-result") {
      const index = pendingIndices.shift();
      if (index !== undefined) {
        calls[index] = { ...calls[index]!, result: message.result, isFailure: message.isFailure, hasResult: true };
      }
    }
  }

  return calls;
};

// Reconstruye los turnos ya cerrados de una conversación cargada del servidor. `conversation.messages`
// ya llega como copia de presentación (§5.1): el mensaje `user` de cada turno es `turn.input`, así que
// aquí solo hace falta recortar por `messageCount`, nunca volver a tocar el bloque técnico.
export const turnViewsFromConversation = (conversation: Conversation): readonly TurnView[] => {
  let cursor = 0;
  return conversation.turns.map((turn, index) => {
    const slice = conversation.messages.slice(cursor, cursor + turn.messageCount);
    cursor += turn.messageCount;

    const last = slice.at(-1);
    const assistantText = last !== undefined && last.role === "assistant" ? last.content : null;
    // La rebanada de actividad excluye siempre el `user` inicial; excluye el `assistant` final solo
    // cuando lo hay (un turno fallido no añade mensaje de asistente, ver harness/session.ts).
    const activitySlice = slice.slice(1, assistantText !== null ? -1 : undefined);
    const lastStepError = turn.steps.at(-1)?.error;

    return {
      key: `turn-${index}-${turn.startedAt}`,
      input: turn.input,
      context: turn.context,
      calls: groupCalls(activitySlice),
      assistantText,
      followUpQuestions: turn.followUpQuestions,
      status: lastStepError !== undefined ? "failure" : "success",
      errorMessage: lastStepError?.message ?? null,
      sources: turn.sources
    } satisfies TurnView;
  });
};

// El turno en curso se construye aparte, a partir de los eventos de streaming (fase 4, decisión 6: el
// cliente ya no reconstruye historial, solo acumula el turno que está mandando). Estas funciones son
// puras: `Chat.tsx` las aplica sobre su estado según llegan los eventos NDJSON.

// `key` único por turno enviado (`live-…`): `MessageList` lo usa para reconciliar el mismo componente
// cuando el turno pasa de "en vivo" a cerrado sin reiniciar el revelado (§4.2.6), y para distinguir un
// turno de esta sesión de uno hidratado del historial (`turn-…`), que se muestra siempre completo.
export const emptyTurnView = (input: string, context: readonly ChatContextRef[]): TurnView => ({
  key: `live-${crypto.randomUUID()}`,
  input,
  context,
  calls: [],
  assistantText: null,
  followUpQuestions: [],
  status: "running",
  errorMessage: null,
  sources: []
});

export const applyMessageToTurnView = (turn: TurnView, message: AgentMessage): TurnView => {
  switch (message.role) {
    case "user":
      // El `user` que abre el turno ya es `turn.input` en el estado inicial (§5.1): el servidor lo
      // reenvía enmascarado durante el streaming, así que no aporta nada nuevo aquí.
      return turn;
    case "assistant":
      return { ...turn, assistantText: message.content, status: "success" };
    case "tool-call":
      return { ...turn, calls: [...turn.calls, pendingCall(message.name, message.input)] };
    case "tool-result": {
      const pendingIndex = turn.calls.findIndex((call) => !call.hasResult);
      if (pendingIndex === -1) {
        return turn;
      }
      const calls = [...turn.calls];
      calls[pendingIndex] = { ...calls[pendingIndex]!, result: message.result, isFailure: message.isFailure, hasResult: true };
      return { ...turn, calls };
    }
  }
};

// El evento `source` trae la entrada del material ya fusionada en servidor, así que se sustituye la
// que hubiera de ese `materialId` en vez de acumular una segunda con las mismas páginas.
export const withSource = (turn: TurnView, source: ConversationSource): TurnView => {
  const index = turn.sources.findIndex((current) => current.materialId === source.materialId);
  if (index === -1) {
    return { ...turn, sources: [...turn.sources, source] };
  }
  const sources = [...turn.sources];
  sources[index] = source;
  return { ...turn, sources };
};

export const withFollowUpQuestions = (turn: TurnView, questions: readonly string[]): TurnView => ({
  ...turn,
  followUpQuestions: questions
});

export const withTurnFailure = (turn: TurnView, errorMessage: string): TurnView => ({
  ...turn,
  status: "failure",
  errorMessage
});
