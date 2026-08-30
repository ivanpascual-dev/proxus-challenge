import { Schema } from "effect";
import { AttemptMode, QuestionOption, QuestionSource, TestAnswer } from "./artifact.ts";

// Los contratos de los endpoints de intento (fase 3, §5.6). El ciclo de vida del intento
// (`in-progress` → `graded` | `abandoned`) vive en `schemas/artifact.ts`; aquí van las entradas de
// cada endpoint y la proyección de la prueba SIN clave de respuesta.

// --- La prueba sin clave de respuesta (decisión 9) --------------------------------------------------
// Mientras se resuelve, no viaja al navegador `correctOptionId`, `correctAnswer`, `expectedAnswer`,
// rúbrica, explicación ni pista. Un examen cuyas respuestas están en el código fuente de la página no
// es un examen. La pista, en modo práctica, la sirve su propio endpoint al abrirla (§6.11).

export const SolvableMultipleChoice = Schema.Struct({
  type: Schema.Literal("multiple-choice"),
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(QuestionOption),
  source: QuestionSource,
  hasHint: Schema.Boolean
});

export const SolvableMultipleResponse = Schema.Struct({
  type: Schema.Literal("multiple-response"),
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(QuestionOption),
  source: QuestionSource,
  hasHint: Schema.Boolean
});

export const SolvableTrueFalse = Schema.Struct({
  type: Schema.Literal("true-false"),
  id: Schema.String,
  prompt: Schema.String,
  source: QuestionSource,
  hasHint: Schema.Boolean
});

export const SolvableShortAnswer = Schema.Struct({
  type: Schema.Literal("short-answer"),
  id: Schema.String,
  prompt: Schema.String,
  source: QuestionSource,
  hasHint: Schema.Boolean
});

export const SolvableQuestion = Schema.Union([
  SolvableMultipleChoice,
  SolvableMultipleResponse,
  SolvableTrueFalse,
  SolvableShortAnswer
]);
export type SolvableQuestion = typeof SolvableQuestion.Type;

export const SolvableAssessment = Schema.Struct({
  id: Schema.String,
  kind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  title: Schema.String,
  examTimeLimitSeconds: Schema.Number,
  questions: Schema.Array(SolvableQuestion)
});
export type SolvableAssessment = typeof SolvableAssessment.Type;

// --- Entradas de los endpoints --------------------------------------------------------------------

export const StartAttemptInput = Schema.Struct({
  mode: AttemptMode
});
export type StartAttemptInput = typeof StartAttemptInput.Type;

// La entrega. Las respuestas se validan contra sus preguntas en la corrección (`grading.ts`), no en
// el esquema. Se acepta el formato de un Examen (superconjunto del de un Control).
export const SubmitAttemptAnswersInput = Schema.Struct({
  answers: Schema.Array(TestAnswer)
});
export type SubmitAttemptAnswersInput = typeof SubmitAttemptAnswersInput.Type;

export const RevealHintInput = Schema.Struct({
  questionId: Schema.String
});
export type RevealHintInput = typeof RevealHintInput.Type;

export const RevealHintResult = Schema.Struct({
  questionId: Schema.String,
  hint: Schema.String
});
export type RevealHintResult = typeof RevealHintResult.Type;

export const DisputeQuestionInput = Schema.Struct({
  questionId: Schema.String
});
export type DisputeQuestionInput = typeof DisputeQuestionInput.Type;

// El examen en curso, si lo hay. La interfaz lo consulta al arrancar para volver a él tras una
// recarga (§6.11). `null` = no hay ninguno.
export const ActiveAttemptResponse = Schema.Struct({
  attemptId: Schema.NullOr(Schema.String),
  artifactId: Schema.NullOr(Schema.String),
  artifactKind: Schema.NullOr(Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")])),
  remainingSeconds: Schema.NullOr(Schema.Number)
});
export type ActiveAttemptResponse = typeof ActiveAttemptResponse.Type;

// El latido del examen (decisión 19c). El panel lo manda cada `examHeartbeatIntervalMs` mientras
// está abierto: el servidor acumula el tiempo conectado y cierra el hueco de interrupción si venía de
// uno. Devuelve el estado del intento (si el tiempo se agotó, ya está `abandoned`) y los segundos que
// quedan, para que el reloj del cliente se sincronice con la autoridad del servidor.
export const HeartbeatResponse = Schema.Struct({
  attemptStatus: Schema.Union([
    Schema.Literal("in-progress"),
    Schema.Literal("graded"),
    Schema.Literal("abandoned")
  ]),
  remainingSeconds: Schema.Number
});
export type HeartbeatResponse = typeof HeartbeatResponse.Type;

// Lo que la pestaña Pruebas necesita: cada prueba del material con su último intento.
export const AssessmentListEntry = Schema.Struct({
  id: Schema.String,
  kind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  title: Schema.String,
  scope: Schema.Struct({
    materialId: Schema.String,
    topicId: Schema.NullOr(Schema.String),
    topicLabel: Schema.String
  }),
  origin: Schema.Union([Schema.Literal("material"), Schema.Literal("review")]),
  createdAt: Schema.String,
  questionCount: Schema.Number,
  examTimeLimitSeconds: Schema.Number,
  lastAttempt: Schema.NullOr(Schema.Struct({
    id: Schema.String,
    status: Schema.Union([Schema.Literal("in-progress"), Schema.Literal("graded"), Schema.Literal("abandoned")]),
    mode: AttemptMode,
    displayedScore: Schema.NullOr(Schema.Number),
    submittedAt: Schema.NullOr(Schema.String)
  }))
});
export type AssessmentListEntry = typeof AssessmentListEntry.Type;

export const MaterialAssessmentsResponse = Schema.Struct({
  assessments: Schema.Array(AssessmentListEntry)
});
export type MaterialAssessmentsResponse = typeof MaterialAssessmentsResponse.Type;
