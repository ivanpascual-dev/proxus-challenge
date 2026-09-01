import { Schema } from "effect";
import { AgentMessage } from "./agent-message.ts";
import { ChatContextRef } from "./chat-context.ts";

// El coste de un paso del bucle del agente (fase 4, decisión 7: la observabilidad va en el modelo de
// sesión, por paso). Ausente cuando la respuesta del modelo no trajo `usageMetadata`: nunca se pinta
// un cero que finja ser un dato (invariante 3, F4-19).
export const TurnUsage = Schema.Struct({
  inputTokens: Schema.optional(Schema.Number),
  cachedInputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number)
});
export type TurnUsage = typeof TurnUsage.Type;

export const ConversationToolCall = Schema.Struct({
  name: Schema.String,
  input: Schema.Unknown
});
export type ConversationToolCall = typeof ConversationToolCall.Type;

// El error del modelo tal cual (decisión 7): no se disfraza de mensaje del asistente.
export const ConversationStepError = Schema.Struct({
  message: Schema.String,
  at: Schema.String
});
export type ConversationStepError = typeof ConversationStepError.Type;

export const ConversationStep = Schema.Struct({
  index: Schema.Number,
  usage: TurnUsage,
  toolCalls: Schema.Array(ConversationToolCall),
  error: Schema.optional(ConversationStepError)
});
export type ConversationStep = typeof ConversationStep.Type;

// Fase 5, §5.1: el turno visible separado del prompt del modelo. `input` es el texto literal escrito
// por el alumno (nunca el bloque `SCREEN CONTEXT` concatenado); `context` son las referencias
// aceptadas al enviar; `messageCount` corta la secuencia plana de `Conversation.messages` en el turno
// exacto; `followUpQuestions` es el array ya validado por `extractFollowUp`. Un turno antiguo, sin
// estos campos en disco, se migra al leerlo (`session-migration.ts`): nunca se reescribe el prompt
// interno que ya vio el modelo, solo se reconstruye lo que el alumno debe ver.
export const ConversationTurn = Schema.Struct({
  startedAt: Schema.String,
  steps: Schema.Array(ConversationStep),
  input: Schema.String,
  context: Schema.Array(ChatContextRef),
  messageCount: Schema.Number,
  followUpQuestions: Schema.Array(Schema.String)
});
export type ConversationTurn = typeof ConversationTurn.Type;

// Para la lista lateral (decisión 6): sin mensajes ni turnos, para no arrastrar el historial entero
// al pintar la lista de conversaciones.
export const ConversationSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String
});
export type ConversationSummary = typeof ConversationSummary.Type;

// El detalle completo (`GET /tutor/conversations/:id`): los mensajes ya degradados (palanca 1) y sus
// turnos, para reconstruir la conversación y el coste de cada turno (`TurnCost`) al recargar.
export const Conversation = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  messages: Schema.Array(AgentMessage),
  turns: Schema.Array(ConversationTurn),
  createdAt: Schema.String,
  updatedAt: Schema.String
});
export type Conversation = typeof Conversation.Type;
