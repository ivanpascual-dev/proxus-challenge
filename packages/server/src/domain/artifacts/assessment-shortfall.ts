import type { QuizArtifact, TestArtifact } from "./artifact.ts";
import type { QuestionHole } from "./assessment-shape.ts";

// Cuánto se pidió al generar una prueba (correcciones de cierre de fase 5, decisión 10). Los
// artefactos guardados antes de este corte no llevan `requestedQuestionCount`: se interpretan como
// completos, con solicitado igual al real.
export const requestedQuestionCount = (artifact: QuizArtifact | TestArtifact): number =>
  artifact.requestedQuestionCount ?? artifact.questions.length;

export interface AssessmentShortfall {
  readonly requested: number;
  readonly generated: number;
}

// `null` si la prueba está completa (solicitado === real, el caso normal y el de un artefacto
// antiguo). Si es parcial, cuánto se pidió y cuánto hay: la interfaz arma con estos dos números el
// aviso literal `Se pidieron N preguntas; el contenido permitió M.` (C5-05).
export const assessmentShortfall = (artifact: QuizArtifact | TestArtifact): AssessmentShortfall | null => {
  const requested = requestedQuestionCount(artifact);
  const generated = artifact.questions.length;
  return requested > generated ? { requested, generated } : null;
};

// Recorta el reparto determinista de un tema al máximo que el modelo declaró poder dar con el
// marcador antiguo `{insufficientContent:true, maxPossible:N}` (`question-parse.ts`, kind
// "legacy-insufficient"). Toma los primeros `maxPossible` huecos, en el orden en que llegaron, así
// que el recorte es reproducible: la misma entrada recorta siempre los mismos huecos.
export const holesWithinCapacity = (
  holes: readonly QuestionHole[],
  maxPossible: number
): readonly QuestionHole[] => holes.slice(0, Math.max(0, maxPossible));
