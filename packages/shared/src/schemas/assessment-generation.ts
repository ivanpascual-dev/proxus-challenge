import { Schema } from "effect";
import { AssessmentMode, AssessmentOrigin, ArtifactSummary } from "./artifact.ts";

// Contrato de POST /api/materials/:id/assessments, la ruta con progreso de la fase 3 (§5.6, §6.8).
// Espejo de la de generación de apuntes: transformar un material en un activo estructurado es un
// servicio del dominio con su ruta, no una capacidad del tutor (ADR-016, decisión 3).

// El cuerpo de la petición. `questionCount` lo elige el alumno dentro de su rango
// (`questionsPerQuiz` / `questionsPerTest`); el reparto por tipo lo pone el código (§6.2). `topicId`
// es obligatorio para un Control (su alcance es un tema) y `null` para un Examen (el material
// entero, decisión 1). `mode` solo cuenta para el Examen: "practice" = de prueba, "exam" = real
// (generado sin pistas). El Control lo ignora, siempre es de práctica.
export const GenerateAssessmentInput = Schema.Struct({
  kind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  topicId: Schema.NullOr(Schema.String),
  origin: AssessmentOrigin,
  questionCount: Schema.Number,
  mode: AssessmentMode
});
export type GenerateAssessmentInput = typeof GenerateAssessmentInput.Type;

// La ruta rechaza la petición ANTES de abrir el stream (§6.9): cuerpo mal formado, `questionCount`
// fuera de rango, material inexistente o sin indexar, tema fuera del índice, o tope de Controles/
// Exámenes alcanzado. Un solo `_tag` para las cinco: la interfaz solo necesita mostrar `message`,
// nunca distinguir el motivo por código.
export class AssessmentGenerationRejected extends Schema.ErrorClass<AssessmentGenerationRejected>(
  "AssessmentGenerationRejected"
)({
  _tag: Schema.tag("AssessmentGenerationRejected"),
  message: Schema.String
}) {}

// Eventos del stream NDJSON. `topic` es null en la fase de guardado. El `done` lleva cuántas
// preguntas salieron y cuántos reintentos hicieron falta: es observabilidad del modelo para la
// bitácora (riesgo 2), no un aviso para el alumno (§6.8, paso 9).
export const AssessmentGenerationStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("progress"),
    topic: Schema.NullOr(Schema.Number),
    topicCount: Schema.Number,
    message: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("done"),
    assessment: ArtifactSummary,
    questionCount: Schema.Number,
    // Lo que pedía la petición (correcciones de cierre de fase 5, decisión 10 y C5-05): igual a
    // `questionCount` en una prueba completa, mayor en una parcial. La interfaz compara los dos para
    // mostrar el aviso, en vez de que el servidor decida cuándo mostrarlo.
    requestedQuestionCount: Schema.Number,
    retries: Schema.Number
  }),
  Schema.Struct({
    type: Schema.Literal("failed"),
    message: Schema.String
  })
]);
export type AssessmentGenerationStreamEvent = typeof AssessmentGenerationStreamEvent.Type;
