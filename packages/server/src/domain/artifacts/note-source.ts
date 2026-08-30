import { LIMITS, type MaterialIndex } from "@proxus/shared";

// Construye el fragmento cacheado de un bloque con fuente de material desde un `MaterialIndex` ya
// cargado. Puro: recibe el índice, no lo va a buscar. Lo llama `note-service.resolveSources`, que es
// quien resuelve el "material inexistente" y el "material sin índice" (esos no llegan aquí).
//
// El fragmento SIEMPRE lo copia el servidor del índice, nunca el modelo (invariante 8, decisión 4).
// Una cita que no ancla no se descarta ni se publica como buena: se guarda con su motivo (invariante
// 3, decisión 5).

export interface ResolvedMaterialExcerpt {
  readonly excerpt: string | null;
  readonly excerptTruncated: boolean;
  readonly transcribed: boolean;
  readonly unanchoredReason: string | null;
}

const unanchored = (reason: string): ResolvedMaterialExcerpt => ({
  excerpt: null,
  excerptTruncated: false,
  transcribed: false,
  unanchoredReason: reason
});

export const buildMaterialExcerpt = (
  index: MaterialIndex,
  pages: readonly number[]
): ResolvedMaterialExcerpt => {
  if (pages.length === 0) {
    return unanchored("el bloque cita el material pero no dice de qué páginas sale");
  }

  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let transcribed = false;

  for (const page of sorted) {
    if (!Number.isInteger(page) || page < 1 || page > index.pageCount) {
      return unanchored(`el material tiene ${index.pageCount} páginas; se citó la ${page}`);
    }

    const failed = index.failedPages.find((candidate) => candidate.page === page);
    if (failed !== undefined) {
      return unanchored(`la página ${page} no se pudo indexar: ${failed.reason}`);
    }

    const entry = index.pages.find((candidate) => candidate.page === page);
    if (entry === undefined) {
      return unanchored(`la página ${page} no está en el índice del material`);
    }

    if (entry.provenance === "transcribed") {
      transcribed = true;
    }
    parts.push(sorted.length === 1 ? entry.text : `[página ${page}]\n${entry.text}`);
  }

  const joined = parts.join("\n\n");
  const truncated = joined.length > LIMITS.maxSourceExcerptCharacters;

  return {
    excerpt: truncated ? joined.slice(0, LIMITS.maxSourceExcerptCharacters) : joined,
    excerptTruncated: truncated,
    transcribed,
    unanchoredReason: null
  };
};
