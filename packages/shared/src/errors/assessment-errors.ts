import { Schema } from "effect";

// Errores declarados de los endpoints de pruebas e intentos (fase 3, §5.6). El handler los mapea al
// estado HTTP que dice la tabla; nada de `Effect.orDie` (ADR-005, invariante 6). `message` va ya
// redactado en español, para la interfaz. Los endpoints que los usan llegan en el tramo 3B.

// El intento (`in-progress`, `graded` o `abandoned`) no existe.
export class AttemptNotFound extends Schema.ErrorClass<AttemptNotFound>("AttemptNotFound")({
  _tag: Schema.tag("AttemptNotFound"),
  attemptId: Schema.String,
  message: Schema.String
}) {}

// Se alcanzó el techo de intentos de un modo sobre una prueba (`maxPracticeAttemptsPerAssessment` o
// `maxExamAttemptsPerAssessment`). Un intento cancelado o caducado también cuenta (decisión 22).
export class AttemptLimitExceeded extends Schema.ErrorClass<AttemptLimitExceeded>("AttemptLimitExceeded")({
  _tag: Schema.tag("AttemptLimitExceeded"),
  mode: Schema.Union([Schema.Literal("practice"), Schema.Literal("exam")]),
  ceiling: Schema.Number,
  current: Schema.Number,
  message: Schema.String
}) {}

// Se intentó entregar, abandonar o discrepar de un intento que ya no está `in-progress`.
export class AttemptAlreadyClosed extends Schema.ErrorClass<AttemptAlreadyClosed>("AttemptAlreadyClosed")({
  _tag: Schema.tag("AttemptAlreadyClosed"),
  attemptId: Schema.String,
  status: Schema.Union([Schema.Literal("graded"), Schema.Literal("abandoned")]),
  message: Schema.String
}) {}

// La entrega llegó pasado el tiempo conectado del examen. Quien decide si llegó tarde es el servidor
// (decisión 9, §6.11).
export class TimeLimitExceeded extends Schema.ErrorClass<TimeLimitExceeded>("TimeLimitExceeded")({
  _tag: Schema.tag("TimeLimitExceeded"),
  attemptId: Schema.String,
  message: Schema.String
}) {}

// Se pidió revelar una pista que no se puede servir: modo examen, o la pregunta no tiene pista
// (decisión 10). La barrera está en el código, no en la interfaz.
export class HintNotAvailable extends Schema.ErrorClass<HintNotAvailable>("HintNotAvailable")({
  _tag: Schema.tag("HintNotAvailable"),
  questionId: Schema.String,
  reason: Schema.Union([Schema.Literal("exam-mode"), Schema.Literal("no-hint")]),
  message: Schema.String
}) {}

// Se intentó discrepar ("esto sí lo dije") de un intento que todavía no está corregido.
export class AttemptNotGraded extends Schema.ErrorClass<AttemptNotGraded>("AttemptNotGraded")({
  _tag: Schema.tag("AttemptNotGraded"),
  attemptId: Schema.String,
  message: Schema.String
}) {}

// La pregunta citada no está en la prueba del intento. No se casa contra otra: el desajuste no lanza,
// corrige contra la clave equivocada (invariante 7).
export class QuestionNotFound extends Schema.ErrorClass<QuestionNotFound>("QuestionNotFound")({
  _tag: Schema.tag("QuestionNotFound"),
  questionId: Schema.String,
  message: Schema.String
}) {}

// Hay un examen en modo examen sin terminar: la puerta está cerrada (decisión 18). El cuerpo dice el
// intento, el tiempo que queda y cómo salir (entregarlo o cancelarlo): de la puerta cerrada siempre
// se sale y se ve cómo (decisión 19).
export class ExamInProgress extends Schema.ErrorClass<ExamInProgress>("ExamInProgress")({
  _tag: Schema.tag("ExamInProgress"),
  attemptId: Schema.String,
  artifactId: Schema.String,
  artifactKind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  remainingSeconds: Schema.Number,
  message: Schema.String
}) {}

// Se alcanzó el techo de Controles de un tema (`maxQuizzesPerTopic`) o de Exámenes de un material
// (`maxTestsPerMaterial`). El 400 dice cuál es, cuántos hay y que se borre alguno (§5.7).
export class AssessmentLimitExceeded extends Schema.ErrorClass<AssessmentLimitExceeded>("AssessmentLimitExceeded")({
  _tag: Schema.tag("AssessmentLimitExceeded"),
  scope: Schema.Union([Schema.Literal("quiz-per-topic"), Schema.Literal("test-per-material")]),
  ceiling: Schema.Number,
  current: Schema.Number,
  message: Schema.String
}) {}
