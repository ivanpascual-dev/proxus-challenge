import { Schema } from "effect";

// Errores del endpoint de conversaciones del tutor (fase 4, decisión 6: la sesión vive en el
// servidor). El handler los mapea, nunca `orDie` (invariante 6).

export class ConversationNotFound extends Schema.ErrorClass<ConversationNotFound>("ConversationNotFound")({
  _tag: Schema.tag("ConversationNotFound"),
  conversationId: Schema.String,
  message: Schema.String
}) {}

// El almacenamiento de conversaciones falló al leer o escribir (disco ilegible, JSON corrupto). No
// es culpa de la petición, así que es 500, pero declarado y con cuerpo, nunca un orDie mudo
// (invariante 6, molde de `MaterialStorageError`).
export class ConversationStorageError extends Schema.ErrorClass<ConversationStorageError>("ConversationStorageError")({
  _tag: Schema.tag("ConversationStorageError"),
  message: Schema.String
}) {}
