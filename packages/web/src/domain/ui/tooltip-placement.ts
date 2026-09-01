// Posición de un tooltip sin tocar el DOM (plan de correcciones §4.1.5, C5-12). `Tooltip.tsx` mide el
// trigger y la burbuja con `getBoundingClientRect`, en coordenadas de viewport, y delega aquí el
// cálculo. Todo llega y sale en píxeles de viewport, pensado para `position: fixed`.

export interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type TooltipSide = "top" | "bottom";

export interface TooltipPlacement {
  readonly top: number;
  readonly left: number;
  readonly side: TooltipSide;
}

const clamp = (value: number, min: number, max: number): number =>
  // Si el hueco disponible es más estrecho que la burbuja (`max < min`), gana el margen mínimo: el
  // tooltip se pega al borde izquierdo/superior en vez de salirse por el contrario.
  Math.max(min, Math.min(value, Math.max(min, max)));

// Centra el tooltip sobre su control, lo mantiene a `margin` de cualquier borde del viewport y lo
// coloca arriba salvo que no quepa, en cuyo caso lo pone debajo. No busca la posición "óptima" con
// más lógica: arriba por defecto, abajo como alternativa, y recorte a los bordes siempre.
export const placeTooltip = (
  trigger: Rect,
  tooltip: Size,
  viewport: Size,
  margin = 8,
  gap = 6
): TooltipPlacement => {
  const fitsAbove = trigger.top - gap - tooltip.height >= margin;
  const side: TooltipSide = fitsAbove ? "top" : "bottom";

  const rawTop = side === "top"
    ? trigger.top - gap - tooltip.height
    : trigger.top + trigger.height + gap;
  const rawLeft = trigger.left + trigger.width / 2 - tooltip.width / 2;

  return {
    top: clamp(rawTop, margin, viewport.height - margin - tooltip.height),
    left: clamp(rawLeft, margin, viewport.width - margin - tooltip.width),
    side
  };
};
