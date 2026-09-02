// Gesto del separador (fase 5, §11.7). La agarradera hace dos cosas con el mismo puntero: arrastrarla
// redimensiona, pulsarla pliega a Sym. Lo que separa un gesto del otro es solo cuánto se movió el
// puntero entre `pointerdown` y `pointerup`, así que vive aquí, puro y probado: el umbral es una cifra
// elegida (riesgo 17 del plan) y subirla o bajarla tiene que costar un test, no una tarde de pruebas
// a mano en `AppShell`.

export type SeparatorGesture = "drag" | "toggle";

export const SEPARATOR_DRAG_THRESHOLD_PX = 4;

// Por debajo del umbral es una pulsación; a partir de él, un arrastre. El caso no finito (un puntero
// sin coordenada válida) se resuelve como arrastre a propósito: dejar el ratio donde esté es inocuo,
// plegar la superficie del tutor sin que nadie lo haya pedido no lo es.
export const resolveSeparatorGesture = (
  startX: number,
  endX: number,
  threshold: number = SEPARATOR_DRAG_THRESHOLD_PX
): SeparatorGesture => {
  const travelled = Math.abs(endX - startX);
  if (!Number.isFinite(travelled)) {
    return "drag";
  }
  return travelled < threshold ? "toggle" : "drag";
};
