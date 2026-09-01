// El aviso literal de una prueba parcial (correcciones de cierre de fase 5, C5-05): se pidieron más
// preguntas de las que el material permitió generar. `null` cuando la prueba está completa. El texto
// no se resume ni se reescribe: es canónico (plan de correcciones, §6.4).
export const partialAssessmentNotice = (requested: number, generated: number): string | null =>
  requested > generated ? `Se pidieron ${requested} preguntas; el contenido permitió ${generated}.` : null;
