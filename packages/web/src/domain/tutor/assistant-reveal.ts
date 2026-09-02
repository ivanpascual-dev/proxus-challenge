// Revelado progresivo de la respuesta nueva de Sym (plan de correcciones §4.1.6, C5-10). El servidor
// sigue enviando el mensaje completo (decisión 14): esto no es streaming de tokens, es solo presentar
// ese texto ya completo carácter a carácter durante como mucho 1,5 segundos. La lógica pura vive aquí;
// `useAssistantReveal` la conduce con temporizadores y respeta `prefers-reduced-motion`.

// Divide por puntos de código, nunca por unidades UTF-16: `Array.from` recorre code points, así un
// emoji fuera del plano básico (un par suplente en UTF-16) cuenta como uno y nunca se parte a la
// mitad al calcular el prefijo visible.
export const toCodePoints = (text: string): readonly string[] => Array.from(text);

export const codePointLength = (text: string): number => toCodePoints(text).length;

export const sliceCodePoints = (text: string, count: number): string => {
  if (count <= 0) {
    return "";
  }
  const points = toCodePoints(text);
  return count >= points.length ? text : points.slice(0, count).join("");
};

export interface RevealSchedule {
  readonly tickMs: number;
  // Cuántos puntos de código añadir en cada tick para terminar dentro de `maxDurationMs`. Nunca menos
  // de 1 cuando queda algo por mostrar, para que la animación siempre avance y termine.
  readonly codePointsPerTick: number;
  readonly totalCodePoints: number;
}

export const revealSchedule = (
  codePointCount: number,
  maxDurationMs = 1500,
  tickMs = 24
): RevealSchedule => {
  const total = Math.max(0, Math.floor(codePointCount));
  if (total === 0) {
    return { tickMs, codePointsPerTick: 0, totalCodePoints: 0 };
  }
  const ticks = Math.max(1, Math.floor(maxDurationMs / tickMs));
  return {
    tickMs,
    codePointsPerTick: Math.max(1, Math.ceil(total / ticks)),
    totalCodePoints: total
  };
};
