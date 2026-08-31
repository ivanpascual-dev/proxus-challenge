import { Schema } from "effect";

// Errores del endpoint de conversaciones del tutor (fase 4, decisión 6: la sesión vive en el
// servidor). El handler los mapea, nunca `orDie` (invariante 6).

export class ConversationNotFound extends Schema.ErrorClass<ConversationNotFound>("ConversationNotFound")({
  _tag: Schema.tag("ConversationNotFound"),
  conversationId: Schema.String,
  message: Schema.String
}) {}
