import { Schema } from "effect";
import { NoteBlock, NoteProposal } from "./note.ts";

export const QuestionOption = Schema.Struct({
  id: Schema.String,
  text: Schema.String
});
export type QuestionOption = typeof QuestionOption.Type;

// La cita de una pregunta. La COPIA el código del índice del material (decisión 5, F2-09), nunca la
// propone el modelo. `transcribed` marca que alguna página citada viene de una transcripción del
// modelo (invariante 8); `unanchoredReason` no nulo significa que la cita no se pudo comprobar y la
// interfaz lo enseña (invariante 2: ni se descarta ni se publica en silencio).
export const QuestionSource = Schema.Struct({
  materialId: Schema.String,
  topicId: Schema.String,
  pages: Schema.Array(Schema.Number),
  transcribed: Schema.Boolean,
  unanchoredReason: Schema.NullOr(Schema.String)
});
export type QuestionSource = typeof QuestionSource.Type;

// Un criterio de la rúbrica de un desarrollo corto. El `id` (`c1`, `c2`, …) lo pone el código, no el
// modelo (decisión 20b): así no hay ningún nombre que se pueda desincronizar entre la pregunta y la
// corrección.
export const RubricCriterion = Schema.Struct({
  id: Schema.String,
  text: Schema.String
});
export type RubricCriterion = typeof RubricCriterion.Type;

export const MultipleChoiceQuestion = Schema.Struct({
  type: Schema.Literal("multiple-choice"),
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(QuestionOption),
  correctOptionId: Schema.String,
  explanation: Schema.String,
  // `null` = el modelo no la escribió. Solo se sirve y se renderiza en modo práctica (decisión 10).
  hint: Schema.NullOr(Schema.String),
  source: QuestionSource
});
export type MultipleChoiceQuestion = typeof MultipleChoiceQuestion.Type;

// Varias opciones, dos o más correctas (decisión 13). Solo entra en un Examen, no en un Control
// (§6.2). `correctOptionIds` casa contra los ids de `options`, que pone el código por posición.
export const MultipleResponseQuestion = Schema.Struct({
  type: Schema.Literal("multiple-response"),
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(QuestionOption),
  correctOptionIds: Schema.Array(Schema.String),
  explanation: Schema.String,
  hint: Schema.NullOr(Schema.String),
  source: QuestionSource
});
export type MultipleResponseQuestion = typeof MultipleResponseQuestion.Type;

export const TrueFalseQuestion = Schema.Struct({
  type: Schema.Literal("true-false"),
  id: Schema.String,
  prompt: Schema.String,
  correctAnswer: Schema.Boolean,
  explanation: Schema.String,
  hint: Schema.NullOr(Schema.String),
  source: QuestionSource
});
export type TrueFalseQuestion = typeof TrueFalseQuestion.Type;

export const ShortAnswerQuestion = Schema.Struct({
  type: Schema.Literal("short-answer"),
  id: Schema.String,
  prompt: Schema.String,
  expectedAnswer: Schema.String,
  maxScore: Schema.Number,
  hint: Schema.NullOr(Schema.String),
  // Rúbrica vacía = la pregunta no es corregible por el juez y se dice (decisión 12).
  rubric: Schema.Array(RubricCriterion),
  source: QuestionSource
});
export type ShortAnswerQuestion = typeof ShortAnswerQuestion.Type;

export const QuizQuestion = Schema.Union([
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion
]);
export type QuizQuestion = typeof QuizQuestion.Type;

export const TestQuestion = Schema.Union([
  MultipleChoiceQuestion,
  MultipleResponseQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion
]);
export type TestQuestion = typeof TestQuestion.Type;

// El alcance de un Control o un Examen. `topicId` null = el material entero (un Examen). `topicLabel`
// se congela al generar: el índice se puede reindexar y cambiar los ids de tema (riesgo 5).
export const AssessmentScope = Schema.Struct({
  materialId: Schema.String,
  topicId: Schema.NullOr(Schema.String),
  topicLabel: Schema.String
});
export type AssessmentScope = typeof AssessmentScope.Type;

// De dónde salieron las preguntas: "material" = generación nueva; "review" = generación de repaso,
// concentrada en lo fallado, lo consultado con pista y lo marcado (§4).
export const AssessmentOrigin = Schema.Union([
  Schema.Literal("material"),
  Schema.Literal("review")
]);
export type AssessmentOrigin = typeof AssessmentOrigin.Type;

// El apunte nace atado a un material y hay como mucho uno por material (fase 2, decisiones 17 y 19).
// El apunte se ve dentro de la vista de ese material, no en una lista suelta de artefactos.
export const NoteArtifact = Schema.Struct({
  kind: Schema.Literal("note"),
  id: Schema.String,
  title: Schema.String,
  materialId: Schema.String,
  blocks: Schema.Array(NoteBlock),
  proposals: Schema.Array(NoteProposal)
});
export type NoteArtifact = typeof NoteArtifact.Type;

// El modo de una prueba lo fija su generación y vive en el artefacto (ADR que anula la decisión 6 del
// plan de fase 3). El intento sigue llevando su `mode`, pero lo deriva de aquí, no de la petición.
export const AssessmentMode = Schema.Union([
  Schema.Literal("practice"),
  Schema.Literal("exam")
]);
export type AssessmentMode = typeof AssessmentMode.Type;

export const QuizArtifact = Schema.Struct({
  kind: Schema.Literal("quiz"),
  id: Schema.String,
  title: Schema.String,
  questions: Schema.Array(QuizQuestion),
  scope: AssessmentScope,
  origin: AssessmentOrigin,
  createdAt: Schema.String,
  // El Control es siempre de práctica: no lleva `mode`. `examTimeLimitSeconds` lo deriva el código del
  // reparto de preguntas por si se practica a reloj, pero no hay penalización ni puerta cerrada.
  examTimeLimitSeconds: Schema.Number
});
export type QuizArtifact = typeof QuizArtifact.Type;

export const TestArtifact = Schema.Struct({
  kind: Schema.Literal("test"),
  id: Schema.String,
  title: Schema.String,
  questions: Schema.Array(TestQuestion),
  scope: AssessmentScope,
  origin: AssessmentOrigin,
  createdAt: Schema.String,
  examTimeLimitSeconds: Schema.Number,
  // "de prueba" (a libro abierto, con pistas) o "real" (`exam`: puerta cerrada, reloj, penalización,
  // generado sin pistas). Se elige al generar el Examen.
  mode: AssessmentMode
});
export type TestArtifact = typeof TestArtifact.Type;

export const Artifact = Schema.Union([
  NoteArtifact,
  QuizArtifact,
  TestArtifact
]);
export type Artifact = typeof Artifact.Type;
export type ArtifactKind = Artifact["kind"];

export const ArtifactSummary = Schema.Struct({
  id: Schema.String,
  kind: Schema.Union([
    Schema.Literal("note"),
    Schema.Literal("quiz"),
    Schema.Literal("test")
  ]),
  title: Schema.String,
  // Presente en los apuntes desde la fase 2; los Controles y Exámenes también viven dentro de su
  // material (decisión 15). `null` solo si un artefacto antiguo no lo trae.
  materialId: Schema.optional(Schema.String),
  // Solo Controles y Exámenes: lo que la pestaña "Pruebas" necesita para pintar la lista sin
  // descargar cada prueba entera (§5.4). Ausente en los apuntes.
  createdAt: Schema.optional(Schema.String),
  scope: Schema.optional(AssessmentScope),
  origin: Schema.optional(AssessmentOrigin),
  questionCount: Schema.optional(Schema.Number)
});
export type ArtifactSummary = typeof ArtifactSummary.Type;

// Un fichero de artefacto que no se pudo decodificar. Se nombra, nunca se calla: callar cuál falla es
// el fallo silencioso que prohíbe la invariante 3 (F2-07).
export const UnreadableArtifact = Schema.Struct({
  fileName: Schema.String,
  reason: Schema.String
});
export type UnreadableArtifact = typeof UnreadableArtifact.Type;

export const ArtifactListResponse = Schema.Struct({
  artifacts: Schema.Array(ArtifactSummary),
  unreadable: Schema.Array(UnreadableArtifact)
});
export type ArtifactListResponse = typeof ArtifactListResponse.Type;

export const MultipleChoiceAnswer = Schema.Struct({
  questionType: Schema.Literal("multiple-choice"),
  questionId: Schema.String,
  selectedOptionId: Schema.String
});
export type MultipleChoiceAnswer = typeof MultipleChoiceAnswer.Type;

export const MultipleResponseAnswer = Schema.Struct({
  questionType: Schema.Literal("multiple-response"),
  questionId: Schema.String,
  selectedOptionIds: Schema.Array(Schema.String)
});
export type MultipleResponseAnswer = typeof MultipleResponseAnswer.Type;

export const TrueFalseAnswer = Schema.Struct({
  questionType: Schema.Literal("true-false"),
  questionId: Schema.String,
  answer: Schema.Boolean
});
export type TrueFalseAnswer = typeof TrueFalseAnswer.Type;

export const ShortAnswerAnswer = Schema.Struct({
  questionType: Schema.Literal("short-answer"),
  questionId: Schema.String,
  answer: Schema.String
});
export type ShortAnswerAnswer = typeof ShortAnswerAnswer.Type;

export const QuizAnswer = Schema.Union([
  MultipleChoiceAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer
]);
export type QuizAnswer = typeof QuizAnswer.Type;

export const TestAnswer = Schema.Union([
  MultipleChoiceAnswer,
  MultipleResponseAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer
]);
export type TestAnswer = typeof TestAnswer.Type;

// Cualquier respuesta, de un Control o de un Examen. La validez de una respuesta contra su pregunta
// la comprueba la corrección (`grading.ts`), no el esquema.
export const AttemptAnswer = Schema.Union([
  MultipleChoiceAnswer,
  MultipleResponseAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer
]);
export type AttemptAnswer = typeof AttemptAnswer.Type;

export const MultipleChoiceCorrection = Schema.Struct({
  questionType: Schema.Literal("multiple-choice"),
  questionId: Schema.String,
  correct: Schema.Boolean,
  selectedOptionId: Schema.String,
  correctOptionId: Schema.String,
  explanation: Schema.String
});
export type MultipleChoiceCorrection = typeof MultipleChoiceCorrection.Type;

// Crédito parcial con suelo en cero en la nota mostrada; `fullyCorrect` (todo o nada) es lo que lee
// el perfil (decisión 13). Las dos reglas van separadas a propósito.
export const MultipleResponseCorrection = Schema.Struct({
  questionType: Schema.Literal("multiple-response"),
  questionId: Schema.String,
  selectedOptionIds: Schema.Array(Schema.String),
  correctOptionIds: Schema.Array(Schema.String),
  score: Schema.Number,
  maxScore: Schema.Number,
  fullyCorrect: Schema.Boolean,
  explanation: Schema.String
});
export type MultipleResponseCorrection = typeof MultipleResponseCorrection.Type;

export const TrueFalseCorrection = Schema.Struct({
  questionType: Schema.Literal("true-false"),
  questionId: Schema.String,
  correct: Schema.Boolean,
  answer: Schema.Boolean,
  correctAnswer: Schema.Boolean,
  explanation: Schema.String
});
export type TrueFalseCorrection = typeof TrueFalseCorrection.Type;

// El resultado de un criterio de la rúbrica: el juez dice si se cumplió, la nota la calcula el código
// (decisión 12, ADR-002).
export const RubricCriterionResult = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  met: Schema.Boolean
});
export type RubricCriterionResult = typeof RubricCriterionResult.Type;

// `status: "graded"` = el juez pudo corregir y `score` tiene sentido. `"unevaluated"` = no era
// corregible (rúbrica vacía, juez caído, sin relación con la pregunta): `score` es `null`, NO 0
// (invariante 3). `"disputed"` = el alumno pulsó "esto sí lo dije" y la pregunta deja de mover el
// perfil (§6.7, defensa 1).
export const ShortAnswerCorrection = Schema.Struct({
  questionType: Schema.Literal("short-answer"),
  questionId: Schema.String,
  status: Schema.Union([
    Schema.Literal("graded"),
    Schema.Literal("unevaluated"),
    Schema.Literal("disputed")
  ]),
  score: Schema.NullOr(Schema.Number),
  maxScore: Schema.Number,
  criteria: Schema.Array(RubricCriterionResult),
  unevaluatedReason: Schema.NullOr(Schema.String),
  feedback: Schema.String
});
export type ShortAnswerCorrection = typeof ShortAnswerCorrection.Type;

// Una pregunta que el alumno no respondió: cuenta en `maxScore` y no penaliza (§6.1). No responder
// no es fallar, así que no es una corrección "incorrecta": es su propia clase.
export const BlankCorrection = Schema.Struct({
  questionType: Schema.Literal("blank"),
  questionId: Schema.String,
  maxScore: Schema.Number,
  explanation: Schema.String
});
export type BlankCorrection = typeof BlankCorrection.Type;

// Las que puntúan solas, sin juez. Múltiple respuesta entra aquí: su corrección es aritmética.
export const AutoQuestionCorrection = Schema.Union([
  MultipleChoiceCorrection,
  MultipleResponseCorrection,
  TrueFalseCorrection
]);
export type AutoQuestionCorrection = typeof AutoQuestionCorrection.Type;

export const QuestionCorrection = Schema.Union([
  MultipleChoiceCorrection,
  MultipleResponseCorrection,
  TrueFalseCorrection,
  ShortAnswerCorrection,
  BlankCorrection
]);
export type QuestionCorrection = typeof QuestionCorrection.Type;

// El modo del intento es el mismo que el de su prueba (`AssessmentMode`, definido arriba): el intento
// lo hereda del artefacto, no lo elige quien empieza.
export const AttemptMode = AssessmentMode;
export type AttemptMode = AssessmentMode;

// Un hueco en el que el alumno no estaba conectado durante un examen. El reloj cuenta el tiempo
// conectado, no el de pared (decisión 19c); los huecos se guardan y el historial los enseña.
export const AttemptInterruption = Schema.Struct({
  from: Schema.String,
  to: Schema.String
});
export type AttemptInterruption = typeof AttemptInterruption.Type;

// Los campos que comparten los tres estados del intento. El estado (`status`) es lo que los separa,
// no el tipo de artefacto: el mismo Control se practica hoy y se examina mañana (decisión 6).
const attemptBaseFields = {
  id: Schema.String,
  artifactId: Schema.String,
  artifactKind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  mode: AttemptMode,
  startedAt: Schema.String,
  // `null` en práctica: no hay reloj (§4).
  timeLimitSeconds: Schema.NullOr(Schema.Number),
  hintsRevealed: Schema.Array(Schema.String),
  answers: Schema.Array(AttemptAnswer),
  connectedSeconds: Schema.Number,
  lastHeartbeatAt: Schema.NullOr(Schema.String),
  interruptions: Schema.Array(AttemptInterruption)
} as const;

// El intento se crea en el servidor al empezarlo (decisión 8): da `startedAt` con autoridad, sitio
// donde registrar las pistas, y un intento a medias que se ve si se abandona.
export const InProgressAttempt = Schema.Struct({
  ...attemptBaseFields,
  status: Schema.Literal("in-progress")
});
export type InProgressAttempt = typeof InProgressAttempt.Type;

// El único estado que mueve el perfil (§5.5). `penalty` es 0 en práctica siempre (decisión 16).
export const GradedAttempt = Schema.Struct({
  ...attemptBaseFields,
  status: Schema.Literal("graded"),
  submittedAt: Schema.String,
  elapsedSeconds: Schema.Number,
  corrections: Schema.Array(QuestionCorrection),
  rawScore: Schema.Number,
  maxScore: Schema.Number,
  penalty: Schema.Number,
  displayedScore: Schema.Number,
  summary: Schema.String
});
export type GradedAttempt = typeof GradedAttempt.Type;

// Cancelado por el alumno (`cancelled`) o caducado al agotarse su tiempo conectado (`expired`). Se
// guarda con su motivo y su hora y se ve en el historial; NO se corrige y NO mueve el perfil
// (decisión 22).
export const AbandonedAttempt = Schema.Struct({
  ...attemptBaseFields,
  status: Schema.Literal("abandoned"),
  reason: Schema.Union([Schema.Literal("cancelled"), Schema.Literal("expired")]),
  abandonedAt: Schema.String
});
export type AbandonedAttempt = typeof AbandonedAttempt.Type;

export const ArtifactAttempt = Schema.Union([
  InProgressAttempt,
  GradedAttempt,
  AbandonedAttempt
]);
export type ArtifactAttempt = typeof ArtifactAttempt.Type;

// El contrato de entrega. Lleva el `artifactId` dentro porque el CLI del agente no tiene URL
// (packages/shared/CLAUDE.md). El modo y el resto del ciclo de vida los pone el servidor.
export const SubmitQuizAttemptInput = Schema.Struct({
  artifactKind: Schema.Literal("quiz"),
  artifactId: Schema.String,
  answers: Schema.Array(QuizAnswer)
});
export type SubmitQuizAttemptInput = typeof SubmitQuizAttemptInput.Type;

export const SubmitTestAttemptInput = Schema.Struct({
  artifactKind: Schema.Literal("test"),
  artifactId: Schema.String,
  answers: Schema.Array(TestAnswer)
});
export type SubmitTestAttemptInput = typeof SubmitTestAttemptInput.Type;

export const SubmitAttemptInput = Schema.Union([
  SubmitQuizAttemptInput,
  SubmitTestAttemptInput
]);
export type SubmitAttemptInput = typeof SubmitAttemptInput.Type;
