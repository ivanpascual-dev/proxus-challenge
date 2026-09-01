import type { IndexedPage, MaterialTopic } from "@proxus/shared";
import { countDenseCharacters } from "./page-classifier.ts";

// Caracteres no blancos de las páginas ÚNICAS que cita el tema (correcciones de cierre de fase 5,
// C5-04): una página que el tema repite en su propia lista no se cuenta dos veces.
export const denseSourceCharacters = (topic: MaterialTopic, pages: readonly IndexedPage[]): number => {
  const textByPage = new Map(pages.map((page) => [page.page, page.text]));
  const uniquePages = new Set(topic.pages);
  let total = 0;
  for (const page of uniquePages) {
    total += countDenseCharacters(textByPage.get(page) ?? "");
  }
  return total;
};

// Elimina los temas cuyo respaldo de texto no llega al mínimo: portadas, separadores, índices
// administrativos, bibliografías sin contenido y cierres que el modelo etiquetó como tema pese a la
// regla del prompt (`topicsPrompt`). Un padre que se queda sin ningún hijo superviviente y tampoco
// tiene respaldo propio se elimina también. Los `parentId` supervivientes se renormalizan (por si
// algún padre desapareciera) y se conserva el orden original de entrada.
export const pruneUnsupportedTopics = (
  topics: readonly MaterialTopic[],
  pages: readonly IndexedPage[],
  minimum: number
): readonly MaterialTopic[] => {
  const ownSupport = new Set(
    topics.filter((topic) => denseSourceCharacters(topic, pages) >= minimum).map((topic) => topic.id)
  );

  const survivors = topics.filter((topic) =>
    ownSupport.has(topic.id) || topics.some((child) => child.parentId === topic.id && ownSupport.has(child.id))
  );

  const survivingIds = new Set(survivors.map((topic) => topic.id));
  return survivors.map((topic) => ({
    ...topic,
    parentId: topic.parentId !== null && survivingIds.has(topic.parentId) ? topic.parentId : null
  }));
};
