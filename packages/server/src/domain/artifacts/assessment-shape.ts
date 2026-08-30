import { LIMITS } from "@proxus/shared";
import type { AssessmentOrigin, ArtifactKind } from "./artifact.ts";

// Decide la FORMA de la prueba antes de hablar con el modelo (§6.2). Es la pieza que hace la
// generación explicable: cuántas preguntas, de qué tipo y sobre qué tema lo pone el código, siempre
// determinista, así que dos llamadas con la misma entrada dan el mismo plan (ADR-018). La variedad
// entre dos pruebas del mismo tema la pone el modelo al redactar, no un `Math.random()` que nadie
// puede reproducir.

export type AssessableQuestionType =
  | "multiple-choice"
  | "multiple-response"
  | "true-false"
  | "short-answer";

// Por qué está este hueco en el plan. `nueva` = generación de material; el resto son señales del
// perfil en una generación de repaso (§4, decisión 11). Nunca se fusionan en un número.
export type HoleReason = "nueva" | "fallada" | "pista" | "marcada";

export interface QuestionHole {
  readonly topicId: string;
  readonly questionType: AssessableQuestionType;
  readonly reason: HoleReason;
}

// Un tema del alcance ya resuelto a hoja (decisión 1). El servicio lo saca del índice.
export interface PlanTopic {
  readonly id: string;
}

// Las tres señales del perfil, por tema y SEPARADAS (invariante 5). El módulo define su propia forma
// mínima para no acoplarse al `StudyProfile` que llega en el tramo 3D.
export interface TopicSignals {
  readonly topicId: string;
  readonly incorrect: number;
  readonly hintsRevealed: number;
  readonly emphasis: boolean;
}

export interface PlanInput {
  readonly kind: ArtifactKind;
  readonly origin: AssessmentOrigin;
  readonly topics: readonly PlanTopic[];
  readonly questionCount: number;
  // Solo en `origin: "review"`. Un tema sin señales no recibe huecos.
  readonly signals?: readonly TopicSignals[];
  // Solo en `origin: "material"`. Los temas cuyo bloque del apunte está marcado pesan más
  // (decisión 2): la marca de énfasis del alumno mueve el reparto, no solo el repaso.
  readonly emphasizedTopicIds?: readonly string[];
}

export type PlanOutcome =
  | { readonly kind: "holes"; readonly holes: readonly QuestionHole[] }
  | { readonly kind: "out-of-range"; readonly message: string };

// El reparto por tipo, en porcentaje, para que la forma de la prueba no cambie con el tamaño (§6.2).
// El ORDEN de esta lista es el desempate del redondeo por resto mayor: no se reordena.
const TYPE_MIX: Record<"quiz" | "test", ReadonlyArray<readonly [AssessableQuestionType, number]>> = {
  quiz: [
    ["multiple-choice", 0.7],
    ["short-answer", 0.3]
  ],
  test: [
    ["multiple-choice", 0.45],
    ["multiple-response", 0.25],
    ["true-false", 0.1],
    ["short-answer", 0.2]
  ]
};

export const questionCountRange = (kind: ArtifactKind): { readonly min: number; readonly max: number; readonly default: number } =>
  kind === "quiz" ? LIMITS.questionsPerQuiz : LIMITS.questionsPerTest;

// Reparte `total` entre pesos por el método del resto mayor. El empate en la parte fraccionaria se
// rompe por el índice (el orden de declaración), así que es determinista. Peso total 0 → todo a cero.
const largestRemainder = (total: number, weights: readonly number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) {
    return weights.map(() => 0);
  }
  const exact = weights.map((w) => (w / sum) * total);
  const counts = exact.map((v) => Math.floor(v));
  const assigned = counts.reduce((a, b) => a + b, 0);
  const byFraction = exact
    .map((v, index) => ({ index, fraction: v - Math.floor(v) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction.slice(0, total - assigned)) {
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
};

// Si el redondeo dejó un tipo a cero y hay preguntas de sobra, el resto que sobre va ahí antes que a
// ninguno (§6.2): con el mínimo de cada rango todos los tipos salen al menos una vez.
const ensureEveryType = (counts: number[], total: number): number[] => {
  if (total < counts.length) {
    return counts;
  }
  const out = [...counts];
  out.forEach((value, index) => {
    if (value !== 0) {
      return;
    }
    let maxIndex = 0;
    out.forEach((candidate, j) => {
      if (candidate > (out[maxIndex] ?? 0)) {
        maxIndex = j;
      }
    });
    if ((out[maxIndex] ?? 0) > 1) {
      out[maxIndex] = (out[maxIndex] ?? 0) - 1;
      out[index] = value + 1;
    }
  });
  return out;
};

// Expande el reparto por tipo a una lista plana de longitud `questionCount`, en el orden de
// declaración de `TYPE_MIX` (todas las de un tipo seguidas). Es el orden más fácil de comprobar por
// inspección. La prueba final NO se presenta así: se baraja al montarla (`question-order.ts`).
const expandTypes = (kind: "quiz" | "test", questionCount: number): AssessableQuestionType[] => {
  const mix = TYPE_MIX[kind];
  const raw = largestRemainder(questionCount, mix.map(([, weight]) => weight));
  const counts = ensureEveryType(raw, questionCount);
  const types: AssessableQuestionType[] = [];
  mix.forEach(([type], index) => {
    for (let n = 0; n < (counts[index] ?? 0); n += 1) {
      types.push(type);
    }
  });
  return types;
};

const topicWeight = (input: PlanInput, topicId: string): number => {
  if (input.origin === "review") {
    const signal = input.signals?.find((candidate) => candidate.topicId === topicId);
    if (signal === undefined) {
      return 0;
    }
    return 2 * signal.incorrect + signal.hintsRevealed + (signal.emphasis ? 1 : 0);
  }
  return 1 + (input.emphasizedTopicIds?.includes(topicId) === true ? 1 : 0);
};

// El motivo de los huecos de un tema en una generación de repaso: la señal que más pesó. En empate
// gana la más severa (fallada > pista > marcada).
const reviewReason = (signal: TopicSignals | undefined): HoleReason => {
  if (signal === undefined) {
    return "fallada";
  }
  if (2 * signal.incorrect > 0 && 2 * signal.incorrect >= signal.hintsRevealed && 2 * signal.incorrect >= (signal.emphasis ? 1 : 0)) {
    return "fallada";
  }
  if (signal.hintsRevealed > 0 && signal.hintsRevealed >= (signal.emphasis ? 1 : 0)) {
    return "pista";
  }
  return "marcada";
};

export const plan = (input: PlanInput): PlanOutcome => {
  if (input.kind === "note") {
    return { kind: "out-of-range", message: "un apunte no lleva preguntas" };
  }
  const kind = input.kind;
  const range = questionCountRange(kind);
  if (!Number.isInteger(input.questionCount) || input.questionCount < range.min || input.questionCount > range.max) {
    return {
      kind: "out-of-range",
      message: `el número de preguntas de un ${kind === "quiz" ? "Control" : "Examen"} está entre ${range.min} y ${range.max} (pediste ${input.questionCount})`
    };
  }

  const topicWeights = input.topics.map((topic) => topicWeight(input, topic.id));
  const totalWeight = topicWeights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    // Repaso sin nada que repasar: se devuelve vacío y quien llama responde "todavía no hay nada",
    // nunca un repaso inventado (invariante 3).
    return { kind: "holes", holes: [] };
  }

  const perTopic = largestRemainder(input.questionCount, topicWeights);
  const types = expandTypes(kind, input.questionCount);

  const holes: QuestionHole[] = [];
  let cursor = 0;
  input.topics.forEach((topic, topicIndex) => {
    const slots = perTopic[topicIndex] ?? 0;
    if (slots === 0) {
      return;
    }
    const reason: HoleReason =
      input.origin === "material"
        ? "nueva"
        : reviewReason(input.signals?.find((candidate) => candidate.topicId === topic.id));
    for (let n = 0; n < slots; n += 1) {
      holes.push({ topicId: topic.id, questionType: types[cursor] ?? "multiple-choice", reason });
      cursor += 1;
    }
  });

  return { kind: "holes", holes };
};
