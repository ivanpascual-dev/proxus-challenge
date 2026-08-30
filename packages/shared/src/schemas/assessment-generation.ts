import { Schema } from "effect";
import { AssessmentOrigin, ArtifactSummary } from "./artifact.ts";

// Contrato de POST /api/materials/:id/assessments, la ruta con progreso de la fase 3 (§5.6, §6.8).
// Espejo de la de generación de apuntes: transformar un material en un activo estructurado es un
// servicio del dominio con su ruta, no una capacidad del tutor (ADR-016, decisión 3).

// El cuerpo de la petición. `questionCount` lo elige el alumno dentro de su rango
// (`questionsPerQuiz` / `questionsPerTest`); el reparto por tipo lo pone el código (§6.2). `topicId`
// es obligatorio para un Control (su alcance es un tema) y `null` para un Examen (el material
// entero, decisión 1).
export const GenerateAssessmentInput = Schema.Struct({
  kind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  topicId: Schema.NullOr(Schema.String),
  origin: AssessmentOrigin,
  questionCount: Schema.Number
});
export type GenerateAssessmentInput = typeof GenerateAssessmentInput.Type;

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
    retries: Schema.Number
  }),
  Schema.Struct({
    type: Schema.Literal("failed"),
    message: Schema.String
  })
]);
export type AssessmentGenerationStreamEvent = typeof AssessmentGenerationStreamEvent.Type;
