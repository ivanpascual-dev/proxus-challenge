import type {
  AttemptAnswer,
  BlankCorrection,
  GradedAttempt,
  InProgressAttempt,
  MultipleChoiceCorrection,
  MultipleResponseCorrection,
  MultipleResponseQuestion,
  QuestionCorrection,
  QuizArtifact,
  ShortAnswerCorrection,
  TestArtifact,
  TrueFalseCorrection
} from "./artifact.ts";
import { displayedScore, penalty } from "./exam-scoring.ts";

// Corrección pura, sin entrada/salida. Sale de `artifact.ts`, que mezclaba esquemas, puerto y
// corrección en un fichero (§6.1). Aquí vive el riesgo silencioso: una nota mal calculada no lanza
// nada.
//
// El bug que arregla (§3): la versión anterior recorría `attempt.answers` y sacaba `maxScore` de las
// correcciones hechas, así que responder 2 de 10 preguntas daba 2/2. Aquí se recorre SIEMPRE
// `artifact.questions`: una pregunta sin responder produce una corrección `blank`, cuenta en
// `maxScore` y no penaliza.

type Question = QuizArtifact["questions"][number] | TestArtifact["questions"][number];

export interface GradingResult {
  readonly corrections: readonly QuestionCorrection[];
  readonly rawScore: number;
  readonly maxScore: number;
}

// `score = max(0, aciertos − marcadas de más) / correctas × maxScore`; `fullyCorrect` solo si el
// conjunto marcado es exactamente el correcto (decisión 13). `maxScore` de una múltiple respuesta es
// 1, como el resto de preguntas de opciones.
export const correctMultipleResponse = (
  question: MultipleResponseQuestion,
  selectedOptionIds: readonly string[]
): MultipleResponseCorrection => {
  const correct = new Set(question.correctOptionIds);
  const selected = new Set(selectedOptionIds);
  const hits = [...selected].filter((id) => correct.has(id)).length;
  const overpicks = [...selected].filter((id) => !correct.has(id)).length;
  const maxScore = 1;
  const ratio = correct.size === 0 ? 0 : Math.max(0, hits - overpicks) / correct.size;

  return {
    questionType: "multiple-response",
    questionId: question.id,
    selectedOptionIds: [...selectedOptionIds],
    correctOptionIds: [...question.correctOptionIds],
    score: ratio * maxScore,
    maxScore,
    fullyCorrect: correct.size === selected.size && [...correct].every((id) => selected.has(id)),
    explanation: question.explanation
  };
};

const blank = (questionId: string, maxScore: number, explanation: string): BlankCorrection => ({
  questionType: "blank",
  questionId,
  maxScore,
  explanation
});

const correctionScore = (correction: QuestionCorrection): number => {
  switch (correction.questionType) {
    case "multiple-choice":
    case "true-false":
      return correction.correct ? 1 : 0;
    case "multiple-response":
      return correction.score;
    case "short-answer":
      return correction.score ?? 0;
    case "blank":
      return 0;
  }
};

// Un desarrollo corto `unevaluated` o `disputed` no baja la nota NI sube el `maxScore` puntuable
// (invariante 3): "no lo sé" no es "cero".
const correctionMaxScore = (correction: QuestionCorrection): number => {
  switch (correction.questionType) {
    case "multiple-choice":
    case "true-false":
      return 1;
    case "multiple-response":
      return correction.maxScore;
    case "short-answer":
      return correction.status === "graded" ? correction.maxScore : 0;
    case "blank":
      return correction.maxScore;
  }
};

const answerFor = (answers: readonly AttemptAnswer[], question: Question): AttemptAnswer | undefined => {
  const answer = answers.find((candidate) => candidate.questionId === question.id);
  // Una respuesta del tipo equivocado se trata como no respondida: no se casa contra la clave de otra
  // pregunta (invariante 7).
  return answer !== undefined && answer.questionType === question.type ? answer : undefined;
};

const correctQuestion = (
  question: Question,
  answers: readonly AttemptAnswer[],
  openCorrections: readonly ShortAnswerCorrection[]
): QuestionCorrection => {
  const answer = answerFor(answers, question);

  switch (question.type) {
    case "multiple-choice": {
      if (answer === undefined || answer.questionType !== "multiple-choice") {
        return blank(question.id, 1, question.explanation);
      }
      const correction: MultipleChoiceCorrection = {
        questionType: "multiple-choice",
        questionId: question.id,
        correct: answer.selectedOptionId === question.correctOptionId,
        selectedOptionId: answer.selectedOptionId,
        correctOptionId: question.correctOptionId,
        explanation: question.explanation
      };
      return correction;
    }
    case "true-false": {
      if (answer === undefined || answer.questionType !== "true-false") {
        return blank(question.id, 1, question.explanation);
      }
      const correction: TrueFalseCorrection = {
        questionType: "true-false",
        questionId: question.id,
        correct: answer.answer === question.correctAnswer,
        answer: answer.answer,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation
      };
      return correction;
    }
    case "multiple-response": {
      if (answer === undefined || answer.questionType !== "multiple-response" || answer.selectedOptionIds.length === 0) {
        return blank(question.id, 1, question.explanation);
      }
      return correctMultipleResponse(question, answer.selectedOptionIds);
    }
    case "short-answer": {
      if (answer === undefined || answer.questionType !== "short-answer" || answer.answer.trim().length === 0) {
        return blank(question.id, question.maxScore, `Respuesta esperada: ${question.expectedAnswer}`);
      }
      const fromJudge = openCorrections.find((candidate) => candidate.questionId === question.id);
      if (fromJudge !== undefined) {
        return fromJudge;
      }
      // Respondida pero sin veredicto del juez: se enseña sin nota y se dice por qué (invariante 3),
      // nunca un 0.
      const unevaluated: ShortAnswerCorrection = {
        questionType: "short-answer",
        questionId: question.id,
        status: "unevaluated",
        score: null,
        maxScore: question.maxScore,
        criteria: [],
        unevaluatedReason: "el juez no devolvió una corrección para esta pregunta",
        feedback: ""
      };
      return unevaluated;
    }
  }
};

// Recorre `artifact.questions` (no `attempt.answers`). Las correcciones de desarrollo corto llegan ya
// resueltas por el juez en `openCorrections`; el resto se puntúa aquí.
export const gradeAnswers = (
  questions: readonly Question[],
  answers: readonly AttemptAnswer[],
  openCorrections: readonly ShortAnswerCorrection[] = []
): GradingResult => {
  const corrections = questions.map((question) => correctQuestion(question, answers, openCorrections));
  return {
    corrections,
    rawScore: corrections.reduce((sum, correction) => sum + correctionScore(correction), 0),
    maxScore: corrections.reduce((sum, correction) => sum + correctionMaxScore(correction), 0)
  };
};

// `gradeAttempt(artifact, attempt, mode)` de §6.1: cierra un intento `in-progress` como `graded`. La
// penalización y la nota mostrada las hace `exam-scoring` (invariante 5: solo tocan la nota, no el
// perfil). En el tramo 3B el `elapsedSeconds` sale del reloj de tiempo conectado; aquí es
// `connectedSeconds` tal cual.
export const gradeInProgressAttempt = (
  artifact: QuizArtifact | TestArtifact,
  attempt: InProgressAttempt,
  openCorrections: readonly ShortAnswerCorrection[] = []
): GradedAttempt => {
  const { corrections, rawScore, maxScore } = gradeAnswers(
    artifact.questions as readonly Question[],
    attempt.answers,
    openCorrections
  );
  const penaltyPoints = penalty(corrections, attempt.mode);

  return {
    ...attempt,
    status: "graded",
    submittedAt: new Date().toISOString(),
    elapsedSeconds: attempt.connectedSeconds,
    corrections,
    rawScore,
    maxScore,
    penalty: penaltyPoints,
    displayedScore: displayedScore(rawScore, penaltyPoints, maxScore)
  };
};
