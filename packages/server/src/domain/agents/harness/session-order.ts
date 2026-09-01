// C5-07 / plan de correcciones §4.1.3: el historial de conversaciones lista primero las que tienen
// turnos y deja al final los borradores heredados (las 34 sesiones vacías de fase 4 que nunca
// recibieron un mensaje). "Tiene turnos" se mide con `turns.length`, nunca con el título: un borrador
// pudo recibir título en una versión anterior sin llegar a tener un turno, así que el título no
// distingue una conversación real de una vacía.
//
// Dentro de cada grupo el orden es determinista y estable: `updatedAt` descendente, luego `createdAt`
// descendente y por último id ascendente. Con timestamps ISO 8601 del mismo formato la comparación de
// cadena coincide con la cronológica, así que no hace falta parsear fechas. El desempate final por id
// garantiza que dos ficheros con las mismas tres marcas salgan siempre en el mismo sitio para todos
// los clientes.
export interface SessionOrderFields {
  readonly id: string;
  readonly turns: readonly unknown[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const descending = (a: string, b: string): number => (a === b ? 0 : a < b ? 1 : -1);
const ascending = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

export const sortSessionsForHistory = <T extends SessionOrderFields>(sessions: readonly T[]): readonly T[] =>
  [...sessions].sort((a, b) => {
    const aHasTurns = a.turns.length > 0;
    const bHasTurns = b.turns.length > 0;
    if (aHasTurns !== bHasTurns) {
      return aHasTurns ? -1 : 1;
    }

    const byUpdated = descending(a.updatedAt, b.updatedAt);
    if (byUpdated !== 0) {
      return byUpdated;
    }

    const byCreated = descending(a.createdAt, b.createdAt);
    if (byCreated !== 0) {
      return byCreated;
    }

    return ascending(a.id, b.id);
  });
