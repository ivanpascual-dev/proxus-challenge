import { LIMITS } from "@proxus/shared";

export interface TurnBudgetState {
  readonly pagesLeft: number;
  readonly bytesLeft: number;
  // Caracteres de texto indexado que le quedan al turno para `materials read`. Vive aquí, en el mismo
  // estado de turno que las páginas y los bytes de imagen, porque es el mismo tipo de techo: por
  // turno, no por llamada (invariante 11).
  readonly indexCharactersLeft: number;
}

export const initialTurnBudgetState: TurnBudgetState = {
  pagesLeft: LIMITS.maxPagesPerTurn,
  bytesLeft: LIMITS.maxTurnImageBytes,
  indexCharactersLeft: LIMITS.maxIndexTextCharactersPerTurn
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

  const nextState: TurnBudgetState = { ...state, pagesLeft, bytesLeft };
  const total = pageSizes.length;
  if (served === total) {
    return { served, nextState, notice: null };
  }

  return { served, nextState, notice: explainStop(served, total, nextState) };
};

export interface IndexPageCost {
  readonly page: number;
  readonly characters: number;
}

export interface PlanIndexReadResult {
  readonly served: number;
  readonly lastServedPage: number | null;
  readonly nextState: TurnBudgetState;
  readonly notice: string | null;
}

// El aviso de `materials read` cuando el techo de caracteres de texto indexado por turno para la
// lectura. Es texto de cara al modelo (resultado de herramienta), en inglés como el resto de la
// salida del CLI del tutor. F2-15 pide que nombre la última página servida y el total pedido.
export const explainIndexStop = (lastServedPage: number | null, totalRequested: number): string =>
  lastServedPage === null
    ? `Stopped before reading any of the ${totalRequested} requested pages: the per-turn limit of ${LIMITS.maxIndexTextCharactersPerTurn} indexed-text characters would be exceeded.`
    : `Read up to page ${lastServedPage} of the ${totalRequested} requested pages: reached the per-turn limit of ${LIMITS.maxIndexTextCharactersPerTurn} indexed-text characters.`;

// Puro y testeable. Gemelo de `planRender` para `materials read`: decide cuántas páginas de texto
// indexado caben en lo que le queda al turno. Página entera o nada, nunca media página en silencio
// (invariante 11).
export const planIndexRead = (
  state: TurnBudgetState,
  pageCosts: readonly IndexPageCost[]
): PlanIndexReadResult => {
  let indexCharactersLeft = state.indexCharactersLeft;
  let served = 0;
  let lastServedPage: number | null = null;

  for (const cost of pageCosts) {
    if (cost.characters > indexCharactersLeft) {
      break;
    }
    indexCharactersLeft -= cost.characters;
    served += 1;
    lastServedPage = cost.page;
  }

  const nextState: TurnBudgetState = { ...state, indexCharactersLeft };
  if (served === pageCosts.length) {
    return { served, lastServedPage, nextState, notice: null };
  }

  return {
    served,
    lastServedPage,
    nextState,
    notice: explainIndexStop(lastServedPage, pageCosts.length)
  };
};
