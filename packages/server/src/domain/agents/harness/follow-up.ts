import { LIMITS } from "@proxus/shared";

export interface AgentFollowUp {
  readonly text: string;
  readonly questions: readonly string[];
}

// Decisión 8 (fase 4): el bloque de seguimiento viaja en la misma respuesta y el servidor lo recorta.
// Anclado al final del texto porque el prompt pide "write nothing after it": si algo lo sigue, o el
// bloque falta o no trae exactamente `LIMITS.followUpQuestions` preguntas dentro del techo de
// caracteres, no se completa ni se inventa nada (invariante 3). Si solo falta el delimitador de
// cierre, pero el sufijo termina con las tres líneas válidas, se recuperan esas mismas preguntas: no
// se añade contenido y el fallo de formato no se filtra a la interfaz.
const FOLLOW_UP_OPEN = "<<<FOLLOW-UP>>>";
const FOLLOW_UP_BLOCK = /<<<FOLLOW-UP>>>\n([\s\S]*?)\n<<<END FOLLOW-UP>>>\s*$/;
const NUMBERED_LINE = /^\d+\.\s+(.*)$/;

export const extractFollowUp = (text: string): AgentFollowUp => {
  const openIndex = findFollowUpOpen(text);
  if (openIndex === -1) {
    return { text, questions: [] };
  }

  // El prompt pide "write nothing after it": en cuanto el modelo abre el bloque, lo que sigue no es
  // texto para el alumno, esté bien formado o no. Si viene a medias (falta el cierre, por ejemplo),
  // no basta con no inventar preguntas (F4-29): el delimitador crudo tampoco puede quedar visible
  // (F4-30), así que se recorta aquí y no solo en el camino feliz de abajo.
  const visibleText = text.slice(0, openIndex).trimEnd();

  const suffix = text.slice(openIndex);
  const match = suffix.match(FOLLOW_UP_BLOCK);
  const body = match?.[1] ?? unclosedBodyAtEnd(suffix);
  if (body === undefined) {
    return { text: visibleText, questions: [] };
  }

  const lines = body.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const questions = lines.map((line) => line.match(NUMBERED_LINE)?.[1]?.trim());

  const wellFormed = questions.length === LIMITS.followUpQuestions
    && questions.every((question) => question !== undefined && question.length > 0 && question.length <= LIMITS.maxFollowUpQuestionCharacters);

  if (!wellFormed) {
    return { text: visibleText, questions: [] };
  }

  return {
    text: visibleText,
    questions: questions as string[]
  };
};

// Caso real observado al cerrar fase 4: el modelo produjo las tres preguntas y terminó la respuesta
// sin `<<<END FOLLOW-UP>>>`. Solo se tolera esa ausencia cuando la apertura es exacta y todo lo que
// queda hasta EOF es el cuerpo candidato. La validación común de cantidad y longitud decide después;
// una línea adicional, dos preguntas o un cierre deformado no se recuperan.
const unclosedBodyAtEnd = (suffix: string): string | undefined => {
  const prefix = `${FOLLOW_UP_OPEN}\n`;
  if (!suffix.startsWith(prefix) || suffix.includes("<<<END FOLLOW-UP")) {
    return undefined;
  }
  return suffix.slice(prefix.length).trimEnd();
};

// La primera apertura del bloque que no está citada dentro de un ```: el prompt dice que el bloque va
// al final, así que no hay razón legítima para que el texto siga tras un `<<<FOLLOW-UP>>>` real.
const findFollowUpOpen = (text: string): number => {
  let searchFrom = 0;
  for (;;) {
    const index = text.indexOf(FOLLOW_UP_OPEN, searchFrom);
    if (index === -1) {
      return -1;
    }
    if (!isInsideCodeFence(text, index)) {
      return index;
    }
    searchFrom = index + FOLLOW_UP_OPEN.length;
  }
};

// Un `<<<FOLLOW-UP>>>` citado dentro de un bloque de código (por ejemplo, el modelo explicando su
// propio formato) no es el bloque real: un número impar de ``` antes de la coincidencia significa
// que sigue abierto ahí.
const isInsideCodeFence = (text: string, position: number): boolean => {
  const before = text.slice(0, position);
  const fenceCount = (before.match(/```/g) ?? []).length;
  return fenceCount % 2 === 1;
};
