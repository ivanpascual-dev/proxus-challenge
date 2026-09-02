// La línea de progreso de una generación (fase 5, §11.2). Convierte un evento real del stream en
// frase, contador y nada más: no hay carrusel de frases por tiempo ni porcentaje inventado, porque
// una animación que avanza mientras el servidor está parado es exactamente el valor neutro que
// prohíbe la invariante 3 de AGENTS.md (ADR-029).
//
// La frase NO se compone troceando `event.message`. El texto del servidor sigue viajando y se usa
// para el log y para el camino de fallo, pero parsear castellano del servidor es un acoplamiento que
// se rompe en silencio en cuanto alguien cambia una palabra.

export interface ProgressLine {
  // La frase, sin contador. Es lo único que se anuncia a un lector de pantalla (§11.3).
  readonly phrase: string;
  // `null` cuando no hay avance contable: fase de cierre, o total que no da para contar.
  readonly step: number | null;
  readonly total: number | null;
}

// El contador solo existe cuando el total es mayor que 1: un Control de un solo tema no dice
// "tema 1 de 1", y un total de 0 (o incoherente) no inventa una fracción.
const counted = (phrase: string, step: number, total: number): ProgressLine =>
  total > 1 ? { phrase, step, total } : { phrase, step: null, total: null };

const closing = (phrase: string): ProgressLine => ({ phrase, step: null, total: null });

// Indexado: `page` es null en la fase de temas (`MaterialIndexStreamEvent`). Se pierde a propósito la
// distinción entre extraer texto y transcribir con el modelo, que hoy viaja dentro del mensaje: el
// alumno no pierde ese dato, porque la marca "transcrito por el modelo" sigue en cada página del PDF
// y en cada cita.
export const indexProgressLine = (event: {
  readonly page: number | null;
  readonly pageCount: number;
}): ProgressLine =>
  event.page === null
    ? closing("Ordenando los temas del material")
    : counted("Leyendo el documento", event.page, event.pageCount);

// Apuntes: `topic` es null en la fase de guardado (`NoteGenerationStreamEvent`).
export const noteProgressLine = (event: {
  readonly topic: number | null;
  readonly topicCount: number;
}): ProgressLine =>
  event.topic === null
    ? closing("Guardando los apuntes")
    : counted("Redactando los apuntes", event.topic, event.topicCount);

// Pruebas: `topic` es null en la fase de guardado (`AssessmentGenerationStreamEvent`).
export const assessmentProgressLine = (event: {
  readonly topic: number | null;
  readonly topicCount: number;
}): ProgressLine =>
  event.topic === null
    ? closing("Guardando la prueba")
    : counted("Escribiendo las preguntas", event.topic, event.topicCount);

// La petición está en vuelo y todavía no ha llegado ningún evento. Sigue siendo un hecho real (la
// petición existe), no una frase decorativa, y por eso es una línea sin contador en vez de una barra
// con un porcentaje elegido a ojo.
export const INDEX_STARTING_LINE: ProgressLine = closing("Abriendo el documento…");
export const NOTES_STARTING_LINE: ProgressLine = closing("Leyendo el índice del material…");
export const ASSESSMENT_STARTING_LINE: ProgressLine = closing("Preparando el reparto de preguntas…");
