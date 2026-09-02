import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { AgentMessage } from "../schemas/agent-message.ts";
import { ChatContextRef } from "../schemas/chat-context.ts";
import { Conversation, ConversationSource, ConversationSummary, TurnUsage } from "../schemas/conversation.ts";
import { ConversationNotFound, ConversationStorageError, InvalidScreenContext } from "../errors/conversation-errors.ts";
import { LimitExceeded, RateLimited } from "../errors/limit-exceeded.ts";
import { ExamLockdownGuard } from "./exam-lockdown.ts";

// La sesión vive en el servidor (fase 4, decisión 6): el cliente ya no manda el historial, solo el
// turno nuevo. `context` viaja por referencia (decisión 5), nunca como texto pegado.
export const TutorChatRequest = Schema.Struct({
  conversationId: Schema.String,
  input: Schema.String,
  context: Schema.Array(ChatContextRef),
  maxSteps: Schema.optional(Schema.Number)
});
export type TutorChatRequest = typeof TutorChatRequest.Type;

export const TutorChatResponse = Schema.Struct({
  output: Schema.String
});
export type TutorChatResponse = typeof TutorChatResponse.Type;

// El evento NDJSON del turno en curso. `follow-up` recorta el bloque de preguntas del texto del
// modelo (decisión 8); `usage` es el coste del paso, tal como llega del modelo, sin inventar un cero
// cuando falta (invariante 3); `error` es el fallo del modelo tal cual, ya no disfrazado de respuesta
// (decisión 7); `warning` es el aviso al 75% de `maxConversationHistoryTokens`, informativo, no
// impide que el turno se complete.
export const TutorChatStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("message"),
    message: AgentMessage
  }),
  Schema.Struct({
    type: Schema.Literal("follow-up"),
    questions: Schema.Array(Schema.String)
  }),
  Schema.Struct({
    type: Schema.Literal("usage"),
    usage: TurnUsage
  }),
  // Fase 5, §5.3: una fuente confirmada durante el turno. Llega cuando una lectura o vista de material
  // sirvió páginas de verdad, con lo que el repositorio devolvió; el mismo material vuelve a emitirse
  // con sus páginas ya fusionadas, así que el cliente sustituye por `materialId` en vez de acumular.
  Schema.Struct({
    type: Schema.Literal("source"),
    source: ConversationSource
  }),
  Schema.Struct({
    type: Schema.Literal("warning"),
    message: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    message: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("done")
  })
]);
export type TutorChatStreamEvent = typeof TutorChatStreamEvent.Type;

export class TutorApi extends HttpApiGroup.make("tutor")
  .add(
    HttpApiEndpoint.post("chat", "/chat", {
      payload: TutorChatRequest,
      success: TutorChatResponse,
      error: [
        ConversationNotFound.pipe(HttpApiSchema.status(404)),
        LimitExceeded.pipe(HttpApiSchema.status(400)),
        // El contexto de pantalla que ya no describe nada real (fase 5, §5.2): la petición es la que
        // está mal, así que 400 con su texto, nunca un 500 mudo (invariante 6).
        InvalidScreenContext.pipe(HttpApiSchema.status(400)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ConversationStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Varias conversaciones, con lista, guardadas en el servidor (decisión 6). Sin mensajes ni
    // turnos: la lista lateral no arrastra el historial entero.
    HttpApiEndpoint.get("listConversations", "/conversations", {
      success: Schema.Array(ConversationSummary),
      error: [
        ConversationStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Se crea vacía y sin título: el título son las primeras palabras del primer mensaje (asunción
    // A2), sin llamada al modelo, y se fija con el primer turno.
    HttpApiEndpoint.post("createConversation", "/conversations", {
      success: ConversationSummary,
      error: [
        LimitExceeded.pipe(HttpApiSchema.status(400)),
        ConversationStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    HttpApiEndpoint.get("getConversation", "/conversations/:id", {
      params: {
        id: Schema.String
      },
      success: Conversation,
      error: [
        ConversationNotFound.pipe(HttpApiSchema.status(404)),
        ConversationStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    HttpApiEndpoint.delete("deleteConversation", "/conversations/:id", {
      params: {
        id: Schema.String
      },
      success: HttpApiSchema.NoContent,
      error: [
        ConversationNotFound.pipe(HttpApiSchema.status(404)),
        ConversationStorageError.pipe(HttpApiSchema.status(500))
      ]
    })
  )
  .middleware(ExamLockdownGuard)
  .prefix("/tutor")
{}
