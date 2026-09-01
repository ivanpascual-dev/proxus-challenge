import type { NoteBlock } from "@proxus/shared";

// Resuelve "ir del tema al apunte" con datos ya existentes (fase 5, decisión 18, §4.1): gana el
// bloque del MISMO material cuyas páginas solapen más con las del tema; empate por posición en el
// apunte (el primero que aparece). No usa contenido del markdown, título ni similitud textual, y
// cero intersección con cualquier bloque devuelve `null`: se abre Apuntes y se dice que no hay
// bloque vinculado, en vez de inventar una relación.
export const findBlockForTopic = (
  blocks: readonly NoteBlock[],
  materialId: string,
  topicPages: readonly number[]
): string | null => {
  const topicPageSet = new Set(topicPages);
  let bestBlockId: string | null = null;
  let bestOverlap = 0;

  for (const block of blocks) {
    if (block.source === null || block.source.type !== "material" || block.source.materialId !== materialId) {
      continue;
    }
    const overlap = block.source.pages.filter((page) => topicPageSet.has(page)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestBlockId = block.id;
    }
  }

  return bestBlockId;
};
