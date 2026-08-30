import { Schema } from "effect";

// El perfil de estudio de un material, tema a tema (ADR-002, ADR-003). Lo escribe el código de forma
// determinista al corregir un intento `graded`; el modelo nunca lo toca y no hay ninguna ruta que lo
// escriba. Las señales van SEPARADAS (invariante 5): fundirlas en un número hace imposible responder
// por qué salió una pregunta ("entra porque la fallaste dos veces" / "porque abriste la pista" /
// "porque la marcaste").

// Los contadores que persisten en `.data/profile/<materialId>.json`. `topicLabel` NO se guarda: se
// resuelve al leer, cruzando el `topicId` con el índice (riesgo 5: el índice puede reindexarse).
const topicCounterFields = {
  topicId: Schema.String,
  // Respondidas y corregibles: única respuesta, múltiple (por `fullyCorrect`), verdadero/falso y
  // desarrollo corto con veredicto del juez.
  correct: Schema.Number,
  incorrect: Schema.Number,
  // Desarrollo corto que el juez no pudo corregir, o que el alumno discrepó ("esto sí lo dije").
  // Nunca cuenta como acierto ni como fallo: es "no lo sé" (invariante 3, ADR-003).
  unevaluated: Schema.Number,
  // Preguntas de este tema que el alumno dejó en blanco. No responder no es fallar (§6.5): cuenta
  // aparte y no sube `incorrect`.
  blank: Schema.Number,
  // Pistas abiertas en preguntas de este tema. Señal propia (decisión 11): nunca convierte un acierto
  // en fallo ni se suma a la dificultad observada.
  hintsRevealed: Schema.Number
} as const;

// La forma que se guarda en disco. `appliedAttemptIds` hace la actualización idempotente por intento:
// un reintento del cliente no cuenta el fallo dos veces (§6.5).
export const StoredTopicProfile = Schema.Struct(topicCounterFields);
export type StoredTopicProfile = typeof StoredTopicProfile.Type;

export const StoredStudyProfile = Schema.Struct({
  materialId: Schema.String,
  topics: Schema.Array(StoredTopicProfile),
  appliedAttemptIds: Schema.Array(Schema.String),
  updatedAt: Schema.NullOr(Schema.String)
});
export type StoredStudyProfile = typeof StoredStudyProfile.Type;

// La forma que viaja por HTTP (`GET /materials/:id/profile`). Añade lo que se resuelve al leer:
// `topicLabel` desde el índice y `emphasis` desde los bloques marcados del apunte (§6.6, ADR-003:
// señal separada, nunca sumada a la dificultad observada). No lleva `appliedAttemptIds`: es detalle
// interno de la persistencia.
export const TopicStudyProfile = Schema.Struct({
  ...topicCounterFields,
  topicLabel: Schema.String,
  emphasis: Schema.Boolean
});
export type TopicStudyProfile = typeof TopicStudyProfile.Type;

export const StudyProfile = Schema.Struct({
  materialId: Schema.String,
  topics: Schema.Array(TopicStudyProfile),
  updatedAt: Schema.NullOr(Schema.String)
});
export type StudyProfile = typeof StudyProfile.Type;
