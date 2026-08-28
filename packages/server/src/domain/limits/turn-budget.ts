import { LIMITS } from "@proxus/shared";

export interface TurnBudgetState {
  readonly pagesLeft: number;
  readonly bytesLeft: number;
}

export const initialTurnBudgetState: TurnBudgetState = {
  pagesLeft: LIMITS.maxPagesPerTurn,
  bytesLeft: LIMITS.maxTurnImageBytes
};

export interface PlanRenderResult {
  readonly served: number;
  readonly nextState: TurnBudgetState;
  readonly notice: string | null;
}

const maxTurnImageMegabytes = Math.round(LIMITS.maxTurnImageBytes / (1024 * 1024));

const stopReason = (state: TurnBudgetState): string =>
  state.pagesLeft <= 0
    ? `se alcanzó el máximo de ${LIMITS.maxPagesPerTurn} páginas por turno`
    : `las imágenes llegaron a ${maxTurnImageMegabytes} MB`;

// El aviso que se da cuando el presupuesto para antes de servir `total` páginas. `state` es el
// presupuesto que queda justo después de la última página servida, así se sabe qué recurso se agotó.
export const explainStop = (served: number, total: number, state: TurnBudgetState): string =>
  `Me detuve en la página ${served} de ${total}: ${stopReason(state)}.`;

// Puro y testeable. Decide cuántas páginas de la lista caben y qué aviso hay que dar.
// pageSizes son los bytes base64 de cada página pedida, en orden. Los bytes solo se conocen tras
// renderizar, así que la llamada real es incremental: se renderiza una página, se pregunta si cabe,
// y si no cabe se para sin renderizar el resto.
export const planRender = (
  state: TurnBudgetState,
  pageSizes: readonly number[]
): PlanRenderResult => {
  let pagesLeft = state.pagesLeft;
  let bytesLeft = state.bytesLeft;
  let served = 0;

  for (const size of pageSizes) {
    if (pagesLeft <= 0 || size > bytesLeft) {
      break;
    }
    pagesLeft -= 1;
    bytesLeft -= size;
    served += 1;
  }

  const nextState = { pagesLeft, bytesLeft };
  const total = pageSizes.length;
  if (served === total) {
    return { served, nextState, notice: null };
  }

  return { served, nextState, notice: explainStop(served, total, nextState) };
};
