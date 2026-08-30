import { Context, Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { LIMITS } from "@proxus/shared";
import type { RubricCriterion, ShortAnswerCorrection } from "./artifact.ts";
import { parseModelJson } from "../materials/model-json.ts";
import {
  OPEN_ANSWER_JUDGE_PROMPT,
  STUDENT_ANSWER_CLOSE,
  STUDENT_ANSWER_OPEN,
  STUDENT_MATERIAL_CLOSE,
  STUDENT_MATERIAL_OPEN
} from "./assessment-prompts.ts";

// El juez de desarrollo corto (§6.7). NO puntúa: dice, criterio a criterio, si la respuesta lo
// cumple. La nota la calcula el código: `criterios cumplidos / total × maxScore`. Un modelo
// devolviendo un `7` es un número que nadie puede auditar; un modelo devolviendo
// `[{criterio, cumplido}]` sí (ADR-002, ADR-019).
//
// `gradable: false`, parseo fallido, timeout o criterios que no casan con la rúbrica → corrección
// `unevaluated` con el motivo. NUNCA una puntuación intermedia (invariante 3). La respuesta se
// enseña sin nota y el perfil apunta `unevaluated`, nunca un 0 disfrazado de rendimiento mediocre.

export interface JudgeQuestion {
  readonly questionId: string;
  readonly prompt: string;
  readonly expectedAnswer: string;
  readonly rubric: readonly RubricCriterion[];
  readonly maxScore: number;
  readonly answer: string;
  // El fragmento cacheado de las páginas citadas: es lo que le deja al juez distinguir una
  // paráfrasis válida de un error, porque tiene contra qué contrastar (§6.7, defensa 3).
  readonly materialExcerpt: string | null;
}

export interface OpenAnswerJudge {
  readonly grade: (
    questions: readonly JudgeQuestion[]
  ) => Effect.Effect<readonly ShortAnswerCorrection[], never, LanguageModel.LanguageModel>;
}

export const OpenAnswerJudge = Context.Service<OpenAnswerJudge>(
  "@proxus/server/artifacts/OpenAnswerJudge"
);

const unevaluated = (question: JudgeQuestion, reason: string): ShortAnswerCorrection => ({
  questionType: "short-answer",
  questionId: question.questionId,
  status: "unevaluated",
  score: null,
  maxScore: question.maxScore,
  criteria: [],
  unevaluatedReason: reason,
  feedback: ""
});

// Interpreta la respuesta del juez para UNA pregunta. Pura y exportada: es lo que mide la eval de
// §6.7.2. `null` de vuelta significa "no se pudo interpretar", y quien llama lo convierte en
// `unevaluated` con el motivo de parseo.
export const interpretJudgeResponse = (
  raw: string,
  question: JudgeQuestion
): ShortAnswerCorrection | null => {
  let value: unknown;
  try {
    value = parseModelJson(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const feedback = typeof record.feedback === "string" ? record.feedback : "";

  if (record.gradable === false) {
    return {
      ...unevaluated(question, "el juez no pudo corregir la respuesta (vacía, en otro idioma o sin relación con la pregunta)"),
      feedback
    };
  }

  if (!Array.isArray(record.criteria)) {
    return null;
  }

  const byId = new Map<string, boolean>();
  for (const entry of record.criteria) {
    if (typeof entry === "object" && entry !== null) {
      const criterion = entry as Record<string, unknown>;
      if (typeof criterion.id === "string") {
        byId.set(criterion.id, criterion.met === true);
      }
    }
  }

  // Los criterios devueltos tienen que ser EXACTAMENTE los de la rúbrica, todos, ni uno más ni uno
  // menos (§6.7, prompt). Si no casan, no se puntúa contra una rúbrica que el juez no respetó.
  const rubricIds = new Set(question.rubric.map((criterion) => criterion.id));
  if (byId.size !== rubricIds.size || [...rubricIds].some((id) => !byId.has(id))) {
    return unevaluated(question, "el juez no devolvió los mismos criterios que se le dieron");
  }

  const criteria = question.rubric.map((criterion) => ({
    id: criterion.id,
    text: criterion.text,
    met: byId.get(criterion.id) === true
  }));
  const metCount = criteria.filter((criterion) => criterion.met).length;

  return {
    questionType: "short-answer",
    questionId: question.questionId,
    status: "graded",
    score: question.rubric.length === 0 ? null : (metCount / question.rubric.length) * question.maxScore,
    maxScore: question.maxScore,
    criteria,
    unevaluatedReason: null,
    feedback
  };
};

const userMessage = (question: JudgeQuestion) => [
  `Enunciado: ${question.prompt}`,
  "",
  `Criterios (devuelve exactamente estos ids):`,
  ...question.rubric.map((criterion) => `- ${criterion.id}: ${criterion.text}`),
  "",
  "Fragmento del material del que salió la pregunta:",
  STUDENT_MATERIAL_OPEN,
  question.materialExcerpt ?? "(sin fragmento disponible)",
  STUDENT_MATERIAL_CLOSE,
  "",
  "Respuesta del alumno:",
  STUDENT_ANSWER_OPEN,
  question.answer,
  STUDENT_ANSWER_CLOSE
].join("\n");

export const make = (): OpenAnswerJudge => ({
  grade: (questions) => Effect.gen(function* () {
    const corrections: ShortAnswerCorrection[] = [];
    for (const [position, question] of questions.entries()) {
      // El reparto acota el Examen más grande a 6 desarrollos cortos; esto es el fusible (invariante
      // 11): pasado el techo se corrige lo que se puede y el resto queda `unevaluated` con motivo, en
      // voz alta, nunca recortado en silencio.
      if (position >= LIMITS.maxJudgeCallsPerAttempt) {
        corrections.push(unevaluated(question, `se alcanzó el techo de ${LIMITS.maxJudgeCallsPerAttempt} correcciones del juez por intento`));
        continue;
      }
      if (question.rubric.length === 0) {
        corrections.push(unevaluated(question, "la pregunta no trae rúbrica: no es corregible por el juez"));
        continue;
      }

      const response = yield* LanguageModel.generateText({
        prompt: [
          { role: "system", content: OPEN_ANSWER_JUDGE_PROMPT },
          { role: "user", content: userMessage(question) }
        ]
      }).pipe(
        Effect.map((result) => interpretJudgeResponse(result.text, question)),
        // Timeout, error de red o del modelo: `unevaluated` con motivo, nunca una nota (invariante 3).
        Effect.catch(() => Effect.succeed(unevaluated(question, "el juez no respondió a tiempo o falló")))
      );

      corrections.push(response ?? unevaluated(question, "no se pudo interpretar la respuesta del juez"));
    }
    return corrections;
  })
});

export const OpenAnswerJudgeLive = Layer.effect(OpenAnswerJudge)(Effect.sync(() => make()));
