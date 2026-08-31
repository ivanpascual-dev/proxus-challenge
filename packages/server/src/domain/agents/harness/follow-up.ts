import { LIMITS } from "@proxus/shared";

export interface AgentFollowUp {
  readonly text: string;
  readonly questions: readonly string[];
}

// Decisión 8 (fase 4): el bloque de seguimiento viaja en la misma respuesta y el servidor lo recorta.
// Anclado al final del texto porque el prompt pide "write nothing after it": si algo lo sigue, o el
// bloque falta, está a medias, o no trae exactamente `LIMITS.followUpQuestions` preguntas dentro del
// techo de caracteres, no se completa ni se inventa nada (invariante 3): el texto vuelve tal cual y
// `questions` vacío.
const FOLLOW_UP_BLOCK = /<<<FOLLOW-UP>>>\n([\s\S]*?)\n<<<END FOLLOW-UP>>>\s*$/;
const NUMBERED_LINE = /^\d+\.\s+(.*)$/;

export const extractFollowUp = (text: string): AgentFollowUp => {
  const match = text.match(FOLLOW_UP_BLOCK);
  const matchIndex = match?.index;
  if (match === null || matchIndex === undefined || isInsideCodeFence(text, matchIndex)) {
    return { text, questions: [] };
  }

  const lines = (match[1] ?? "").split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const questions = lines.map((line) => line.match(NUMBERED_LINE)?.[1]?.trim());

  const wellFormed = questions.length === LIMITS.followUpQuestions
    && questions.every((question) => question !== undefined && question.length > 0 && question.length <= LIMITS.maxFollowUpQuestionCharacters);

  if (!wellFormed) {
    return { text, questions: [] };
  }

  return {
    text: text.slice(0, matchIndex).trimEnd(),
    questions: questions as string[]
  };
};

// Un `<<<FOLLOW-UP>>>` citado dentro de un bloque de código (por ejemplo, el modelo explicando su
// propio formato) no es el bloque real: un número impar de ``` antes de la coincidencia significa
// que sigue abierto ahí.
const isInsideCodeFence = (text: string, position: number): boolean => {
  const before = text.slice(0, position);
  const fenceCount = (before.match(/```/g) ?? []).length;
  return fenceCount % 2 === 1;
};
