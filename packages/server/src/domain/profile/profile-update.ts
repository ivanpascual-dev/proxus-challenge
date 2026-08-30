import type { StoredStudyProfile, StoredTopicProfile } from "@proxus/shared";
import type {
  GradedAttempt,
  QuestionCorrection,
  QuizArtifact,
  TestArtifact
} from "../artifacts/artifact.ts";

// Actualización pura del perfil de estudio (§6.5, ADR-002). Sin entrada/salida y sin fecha propia: la
// hora entra como parámetro para que el test no dependa del reloj. Aquí vive el riesgo silencioso: un
// contador mal movido no lanza nada, y decide qué se te pregunta después.
//
// Las reglas van una por una y SIN fusionar (invariante 5). Ningún campo del perfil es la suma de dos
// señales: `incorrect`, `hintsRevealed`, `blank` y `unevaluated` son cajas distintas. `emphasis` no
// se escribe aquí: se deriva del bloque del apunte al leer el perfil (§6.6). La penalización del
// examen tampoco entra: es de la nota mostrada (invariante 5, decisión 16).

type Assessment = QuizArtifact | TestArtifact;

export const emptyProfile = (materialId: string): StoredStudyProfile => ({
  materialId,
  topics: [],
  appliedAttemptIds: [],
  updatedAt: null
});

const emptyTopic = (topicId: string): StoredTopicProfile => ({
  topicId,
  correct: 0,
  incorrect: 0,
  unevaluated: 0,
  blank: 0,
  hintsRevealed: 0
});

type TopicField = "correct" | "incorrect" | "unevaluated" | "blank" | "hintsRevealed";

// Un desarrollo corto `graded` es acierto solo si el juez dio TODOS los criterios por cumplidos
// (score === maxScore). Cualquier criterio sin cumplir es un fallo observado. `unevaluated` y
// `disputed` no llegan aquí: los filtra `signalFor`.
const gradedShortAnswerIsCorrect = (correction: Extract<QuestionCorrection, { questionType: "short-answer" }>): boolean =>
  correction.score !== null && correction.maxScore > 0 && correction.score >= correction.maxScore;

// Qué señal mueve una corrección. `null` = no mueve el perfil (no debería pasar, defensivo).
const signalFor = (correction: QuestionCorrection): TopicField | null => {
  switch (correction.questionType) {
    case "multiple-choice":
    case "true-false":
      return correction.correct ? "correct" : "incorrect";
    case "multiple-response":
      // Todo o nada en la señal del perfil; el crédito parcial es solo de la nota mostrada (decisión 13).
      return correction.fullyCorrect ? "correct" : "incorrect";
    case "short-answer":
      if (correction.status === "graded") {
        return gradedShortAnswerIsCorrect(correction) ? "correct" : "incorrect";
      }
      // `unevaluated` y `disputed`: "no lo sé", nunca acierto ni fallo (invariante 3, §6.7 defensa 1).
      return "unevaluated";
    case "blank":
      // No responder no es fallar: caja aparte.
      return "blank";
  }
};

// Aplica un intento corregido al perfil. Idempotente por intento: si el id ya está aplicado, devuelve
// el perfil intacto (un reintento del cliente no cuenta el fallo dos veces, §6.5).
export const applyAttempt = (
  profile: StoredStudyProfile,
  artifact: Assessment,
  attempt: GradedAttempt,
  now: string
): StoredStudyProfile => {
  if (profile.appliedAttemptIds.includes(attempt.id)) {
    return profile;
  }

  const topicOf = new Map(artifact.questions.map((question) => [question.id, question.source.topicId]));
  const bump = new Map<string, StoredTopicProfile>(profile.topics.map((topic) => [topic.topicId, { ...topic }]));
  const touch = (topicId: string, field: TopicField): void => {
    const topic = bump.get(topicId) ?? emptyTopic(topicId);
    bump.set(topicId, { ...topic, [field]: topic[field] + 1 });
  };

  for (const correction of attempt.corrections) {
    const topicId = topicOf.get(correction.questionId);
    if (topicId === undefined) {
      // La corrección apunta a una pregunta que no está en la prueba: no se casa contra un tema
      // ajeno (invariante 7). No lanza; se ignora.
      continue;
    }
    const field = signalFor(correction);
    if (field !== null) {
      touch(topicId, field);
    }
  }

  // Abrir una pista es una señal propia, con independencia del resultado de la pregunta (decisión 11).
  for (const questionId of attempt.hintsRevealed) {
    const topicId = topicOf.get(questionId);
    if (topicId !== undefined) {
      touch(topicId, "hintsRevealed");
    }
  }

  return {
    materialId: profile.materialId,
    topics: [...bump.values()],
    appliedAttemptIds: [...profile.appliedAttemptIds, attempt.id],
    updatedAt: now
  };
};

// El perfil como proyección pura de una lista de intentos corregidos, en orden de entrega. Es lo que
// usa el repositorio: recalcular desde cero es determinista e idempotente por construcción, y así
// "esto sí lo dije" (que reescribe un intento ya aplicado) se refleja sin un camino de reversión
// aparte. `emptyProfile` arranca la reducción.
export const rebuildProfile = (
  materialId: string,
  entries: readonly { readonly artifact: Assessment; readonly attempt: GradedAttempt }[],
  now: string
): StoredStudyProfile =>
  entries.reduce(
    (profile, entry) => applyAttempt(profile, entry.artifact, entry.attempt, now),
    emptyProfile(materialId)
  );
