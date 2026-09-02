import { LIMITS } from "@proxus/shared";
import type { AttemptMode, QuestionCorrection, QuizArtifact, TestArtifact } from "./artifact.ts";

// La aritmética del modo examen, pura (§6.3). Solo toca la NOTA MOSTRADA: no entra en el perfil
// (invariante 5, decisión 16).

type Question = QuizArtifact["questions"][number] | TestArtifact["questions"][number];

// Convención española: `aciertos − errores/(opciones−1)`. En blanco ni suma ni resta. Múltiple
// respuesta y desarrollo corto NO penalizan: no hay convención y no se inventa una.
//
// `opciones` es fijo por tipo (decisión 20c): 4 en opción única, 2 en verdadero/falso. Así un fallo
// de opción única cuesta un tercio de acierto y uno de verdadero/falso cuesta un acierto entero. Se
// cuentan los fallos por tipo y se divide una sola vez, para no arrastrar el error de coma flotante
// de sumar 1/3 quince veces.
export const penalty = (
  corrections: readonly QuestionCorrection[],
  mode: AttemptMode
): number => {
  if (mode === "practice") {
    return 0;
  }
  let wrongSingleChoice = 0;
  let wrongTrueFalse = 0;
  for (const correction of corrections) {
    if (correction.questionType === "multiple-choice" && !correction.correct) {
      wrongSingleChoice += 1;
    } else if (correction.questionType === "true-false" && !correction.correct) {
      wrongTrueFalse += 1;
    }
  }
  return wrongSingleChoice / 3 + wrongTrueFalse;
};

// Escala a 10 con suelo en 0. La penalización ya viene calculada (0 en práctica). Es la NOTA
// MOSTRADA (no entra en el perfil, ver el comentario de cabecera), así que se redondea aquí a dos
// decimales como mucho: nadie más la vuelve a leer para hacer cuentas.
export const displayedScore = (rawScore: number, penaltyPoints: number, maxScore: number): number => {
  if (maxScore <= 0) {
    return 0;
  }
  const scaled = ((rawScore - penaltyPoints) / maxScore) * 10;
  const clamped = Math.min(10, Math.max(0, scaled));
  return Math.round(clamped * 100) / 100;
};

// El tiempo del examen lo deriva el código del reparto de preguntas (decisión 17): un presupuesto por
// tipo más un repaso fijo. No es una constante.
export const timeLimitSeconds = (questions: readonly Question[]): number => {
  const perQuestion = questions.reduce((sum, question) => {
    const seconds = LIMITS.examSecondsPerQuestion[question.type] ?? 0;
    return sum + seconds;
  }, 0);
  return perQuestion + LIMITS.examReviewSeconds;
};
