import { Schema } from "effect";

// Errores del endpoint de conversaciones del tutor (fase 4, decisión 6: la sesión vive en el
// servidor). El handler los mapea, nunca `orDie` (invariante 6).

export class ConversationNotFound extends Schema.ErrorClass<ConversationNotFound>("ConversationNotFound")({
  _tag: Schema.tag("ConversationNotFound"),
  conversationId: Schema.String,
  message: Schema.String
}) {}

// El contexto de pantalla que llegó con el turno no describe algo que exista (fase 5, §5.2): un
// material borrado, una página fuera de rango, un artefacto que no es la prueba que dice ser, o un
// bloque que ya no está en su apunte. Se rechaza en voz alta antes de gastar una llamada al modelo,
// nunca se describe al agente una pantalla que no se ha podido comprobar (invariantes 3 y 6).
export class InvalidScreenContext extends Schema.ErrorClass<InvalidScreenContext>("InvalidScreenContext")({
  _tag: Schema.tag("InvalidScreenContext"),
  message: Schema.String
}) {}

// El almacenamiento de conversaciones falló al leer o escribir (disco ilegible, JSON corrupto). No
// es culpa de la petición, así que es 500, pero declarado y con cuerpo, nunca un orDie mudo
// (invariante 6, molde de `MaterialStorageError`).
export class ConversationStorageError extends Schema.ErrorClass<ConversationStorageError>("ConversationStorageError")({
  _tag: Schema.tag("ConversationStorageError"),
  message: Schema.String
}) {}
