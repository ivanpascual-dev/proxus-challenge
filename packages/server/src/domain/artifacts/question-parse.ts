import { LIMITS } from "@proxus/shared";
import { parseModelJson } from "../materials/model-json.ts";
import type { AssessableQuestionType } from "./assessment-shape.ts";

// Parseo defensivo de lo que devuelve el modelo al generar preguntas (§6.4). Su contrato con el
// modelo está diseñado para que la clase de error que más duele NO EXISTA (decisiones 20b y 20c):
//
// - El modelo devuelve `options` como cuatro textos y la correcta como una POSICIÓN (`correctIndex` /
//   `correctIndexes`). Los ids `a`, `b`, `c`, `d` los pone este código por posición, así que un
//   "las opciones son a, b, d y la correcta es la c" deja de ser representable.
// - Los ids de los criterios de la rúbrica (`c1`, `c2`, …) también los pone el código. El modelo
//   escribe textos; los nombres son cosa nuestra.
// - Los ids de pregunta (`q1`, `q2`, …) NO se ponen aquí: se ponen tras todos los reintentos, sobre
//   la lista final combinada, en el servicio de generación (§6.8).
//
// La cita (`source`) tampoco se lee de aquí: la pone el código desde el plan.

const OPTION_IDS = ["a", "b", "c", "d"] as const;

export interface ParsedOption {
  readonly id: string;
  readonly text: string;
}

export interface ParsedRubricCriterion {
  readonly id: string;
  readonly text: string;
}

// Una pregunta parseada: todo menos `id`, `source` y (en el desarrollo corto) `maxScore`, que los
// pone el servicio.
export type ParsedQuestion =
  | {
      readonly type: "multiple-choice";
      readonly prompt: string;
      readonly options: readonly ParsedOption[];
      readonly correctOptionId: string;
      readonly explanation: string;
      readonly hint: string | null;
    }
  | {
      readonly type: "multiple-response";
      readonly prompt: string;
      readonly options: readonly ParsedOption[];
      readonly correctOptionIds: readonly string[];
      readonly explanation: string;
      readonly hint: string | null;
    }
  | {
      readonly type: "true-false";
      readonly prompt: string;
      readonly correctAnswer: boolean;
      readonly explanation: string;
      readonly hint: string | null;
    }
  | {
      readonly type: "short-answer";
      readonly prompt: string;
      readonly expectedAnswer: string;
      readonly rubric: readonly ParsedRubricCriterion[];
      readonly explanation: string;
      readonly hint: string | null;
    };

export interface DroppedQuestion {
  readonly index: number;
  readonly reason: string;
}

export type ParseResult =
  | { readonly kind: "questions"; readonly questions: readonly ParsedQuestion[]; readonly dropped: readonly DroppedQuestion[] }
  // El modelo dice que el material no da para tantas (decisión 22). NO es un error de formato y NO se
  // reintenta: se falla ofreciendo generar `maxPossible`.
  | { readonly kind: "insufficient"; readonly maxPossible: number }
  // No se pudo sacar un objeto JSON de la respuesta. Es un error de formato y SÍ se reintenta.
  | { readonly kind: "unparseable"; readonly reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;

const hintOf = (value: unknown): string | null => (nonEmptyString(value) ? value.trim() : null);

const parseOptions = (raw: unknown): readonly string[] | { readonly error: string } => {
  if (!Array.isArray(raw)) {
    return { error: "la pregunta no trae `options`" };
  }
  if (raw.length !== 4) {
    return { error: `una pregunta de opciones tiene exactamente cuatro, esta trae ${raw.length}` };
  }
  const texts = raw.map((option) => (typeof option === "string" ? option.trim() : ""));
  if (texts.some((text) => text.length === 0)) {
    return { error: "alguna opción viene vacía o no es texto" };
  }
  if (new Set(texts.map((text) => text.toLocaleLowerCase())).size !== 4) {
    return { error: "hay opciones repetidas" };
  }
  return texts;
};

const parseOne = (entry: unknown): ParsedQuestion | { readonly error: string } => {
  if (!isRecord(entry)) {
    return { error: "la entrada no es un objeto" };
  }
  const type = entry.type;
  if (!nonEmptyString(entry.prompt)) {
    return { error: "el enunciado viene vacío" };
  }
  const prompt = entry.prompt.trim();
  const explanation = nonEmptyString(entry.explanation) ? entry.explanation.trim() : "";
  const hint = hintOf(entry.hint);

  switch (type) {
    case "multiple-choice": {
      const options = parseOptions(entry.options);
      if ("error" in options) {
        return options;
      }
      if (!isIndex(entry.correctIndex)) {
        return { error: "`correctIndex` no es una posición entre 0 y 3" };
      }
      return {
        type: "multiple-choice",
        prompt,
        options: options.map((text, index) => ({ id: OPTION_IDS[index]!, text })),
        correctOptionId: OPTION_IDS[entry.correctIndex]!,
        explanation,
        hint
      };
    }
    case "multiple-response": {
      const options = parseOptions(entry.options);
      if ("error" in options) {
        return options;
      }
      if (!Array.isArray(entry.correctIndexes)) {
        return { error: "`correctIndexes` no es una lista" };
      }
      const indexes = [...new Set(entry.correctIndexes.filter(isIndex))].sort((a, b) => a - b);
      if (indexes.length !== entry.correctIndexes.length || indexes.length < 2 || indexes.length > 3) {
        return { error: "`correctIndexes` lleva dos o tres posiciones distintas entre 0 y 3" };
      }
      return {
        type: "multiple-response",
        prompt,
        options: options.map((text, index) => ({ id: OPTION_IDS[index]!, text })),
        correctOptionIds: indexes.map((index) => OPTION_IDS[index]!),
        explanation,
        hint
      };
    }
    case "true-false": {
      if (typeof entry.correctAnswer !== "boolean") {
        return { error: "`correctAnswer` no es un booleano" };
      }
      return { type: "true-false", prompt, correctAnswer: entry.correctAnswer, explanation, hint };
    }
    case "short-answer": {
      if (!nonEmptyString(entry.expectedAnswer)) {
        return { error: "`expectedAnswer` viene vacío" };
      }
      if (!Array.isArray(entry.rubric)) {
        return { error: "`rubric` no es una lista" };
      }
      const criteria = entry.rubric
        .filter(nonEmptyString)
        .slice(0, LIMITS.maxRubricCriteria)
        .map((text, index) => ({ id: `c${index + 1}`, text: text.trim() }));
      if (criteria.length === 0) {
        return { error: "la rúbrica viene vacía: el desarrollo corto no sería corregible" };
      }
      return { type: "short-answer", prompt, expectedAnswer: entry.expectedAnswer.trim(), rubric: criteria, explanation, hint };
    }
    default:
      return { error: `tipo de pregunta desconocido: ${String(type)}` };
  }
};

export const parseGeneratedQuestions = (raw: string): ParseResult => {
  let value: unknown;
  try {
    value = parseModelJson(raw);
  } catch (error) {
    return { kind: "unparseable", reason: error instanceof Error ? error.message : String(error) };
  }

  if (isRecord(value) && value.insufficientContent === true) {
    const maxPossible = typeof value.maxPossible === "number" && Number.isFinite(value.maxPossible)
      ? Math.max(0, Math.floor(value.maxPossible))
      : 0;
    return { kind: "insufficient", maxPossible };
  }

  if (!isRecord(value) || !Array.isArray(value.questions)) {
    return { kind: "unparseable", reason: "la respuesta no trae un array `questions`" };
  }

  const questions: ParsedQuestion[] = [];
  const dropped: DroppedQuestion[] = [];
  value.questions.forEach((entry, index) => {
    const parsed = parseOne(entry);
    if ("error" in parsed) {
      dropped.push({ index, reason: parsed.error });
    } else {
      questions.push(parsed);
    }
  });

  return { kind: "questions", questions, dropped };
};

// Los tipos que un Control acepta (§6.2): sin múltiple respuesta. Un Examen los acepta todos. El
// servicio lo usa para descartar una pregunta del tipo equivocado antes de decodificar el esquema.
export const acceptsQuestionType = (kind: "quiz" | "test", type: AssessableQuestionType): boolean =>
  kind === "test" || type !== "multiple-response";
