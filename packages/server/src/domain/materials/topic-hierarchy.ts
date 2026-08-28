import type { MaterialTopic } from "@proxus/shared";
import type { ParsedTopic } from "./model-json.ts";

// El modelo devuelve un `parent` y unas `pages` por tema, pero puede mentir: referencias a temas que
// no existen, ciclos (A padre de B, B padre de A), cadenas de tres niveles cuando el prompt pide dos,
// o páginas fuera del rango real del material. Esta función deja una jerarquía sana: cada tema o es
// raíz (parentId null) o cuelga de una raíz, nunca de otro subtema; y sus páginas están dentro de
// [1, pageCount], sin repetidos y ordenadas. Es pura y no lanza: lo roto se sanea, no tumba el índice.
// Un tema que se queda sin páginas válidas se descarta (una cita a él nunca anclaría).
export const normalizeTopicHierarchy = (
  topics: readonly ParsedTopic[],
  pageCount: number
): readonly MaterialTopic[] => {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));

  const sanePages = (pages: readonly number[]): readonly number[] => {
    const valid = pages.filter((page) => Number.isInteger(page) && page >= 1 && page <= pageCount);
    return [...new Set(valid)].sort((a, b) => a - b);
  };

  const rawParent = (id: string): string | null => {
    const parent = byId.get(id)?.parent ?? null;
    if (parent === null || parent === id || !byId.has(parent)) {
      return null;
    }
    return parent;
  };

  // Sube por la cadena de padres hasta la raíz. Devuelve esa raíz (a la que se reengancha el tema,
  // aplanando a dos niveles) o null si el tema ya es raíz o la cadena tiene un ciclo.
  const rootAncestor = (start: string): string | null => {
    const visited = new Set<string>([start]);
    let current = rawParent(start);
    while (current !== null) {
      if (visited.has(current)) {
        return null;
      }
      if (rawParent(current) === null) {
        return current;
      }
      visited.add(current);
      current = rawParent(current);
    }
    return null;
  };

  return topics
    .map((topic) => ({
      id: topic.id,
      label: topic.label,
      pages: sanePages(topic.pages),
      parentId: rootAncestor(topic.id)
    }))
    .filter((topic) => topic.pages.length > 0);
};
