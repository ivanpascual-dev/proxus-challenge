import { Context, Data, Effect } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { LIMITS, type MaterialIndex, type MaterialIndexState, type MaterialPageEntry } from "@proxus/shared";
import type { IndexProgress } from "./indexing-service.ts";

export interface PdfMaterial {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly pageCount: number;
  readonly uploadedAt: string;
  readonly indexState: MaterialIndexState;
}

export interface PageImage {
  readonly page: number;
  readonly mediaType: "image/png";
  readonly data: string;
}

export interface MaterialPageImages {
  readonly type: "material-page-images";
  readonly material: PdfMaterial;
  readonly pages: readonly PageImage[];
  // Presente cuando el presupuesto de turno paró antes de servir todas las páginas pedidas.
  readonly notice?: string;
}

export class MaterialNotFound extends Data.TaggedError("MaterialNotFound")<{
  readonly materialId: string;
}> {}

export class InvalidPageRange extends Data.TaggedError("InvalidPageRange")<{
  readonly range: string;
  readonly reason: string;
}> {}

export class TooManyPages extends Data.TaggedError("TooManyPages")<{
  readonly requested: number;
  readonly ceiling: number;
}> {}

export class MaterialNotIndexed extends Data.TaggedError("MaterialNotIndexed")<{
  readonly materialId: string;
}> {}

export class PageOutOfRange extends Data.TaggedError("PageOutOfRange")<{
  readonly materialId: string;
  readonly page: number;
  readonly pageCount: number;
}> {}

export class MaterialRepositoryError extends Data.TaggedError("MaterialRepositoryError")<{
  readonly reason: unknown;
}> {}

export interface RenderedPage {
  readonly material: PdfMaterial;
  readonly image: PageImage;
}

export interface MaterialPageViewResult {
  readonly image: PageImage;
  readonly entry: MaterialPageEntry;
}

export interface MaterialRepository {
  readonly list: () => Effect.Effect<readonly PdfMaterial[], MaterialRepositoryError>;
  readonly get: (id: string) => Effect.Effect<PdfMaterial, MaterialNotFound | MaterialRepositoryError>;
  // Renderiza una sola página. Es lo que permite al presupuesto de turno parar entre página y página
  // sin haber gastado ya el trabajo de renderizar el resto.
  readonly renderPage: (
    id: string,
    page: number
  ) => Effect.Effect<RenderedPage, MaterialNotFound | MaterialRepositoryError>;
  // El índice archivado para el contenido exacto de este material, con su identidad resuelta.
  readonly getIndex: (
    id: string
  ) => Effect.Effect<MaterialIndex, MaterialNotFound | MaterialNotIndexed | MaterialRepositoryError>;
  // La imagen real de una página más su entrada de índice, en la misma respuesta (invariante 8).
  readonly getPageView: (
    id: string,
    page: number
  ) => Effect.Effect<
    MaterialPageViewResult,
    MaterialNotFound | MaterialNotIndexed | PageOutOfRange | MaterialRepositoryError
  >;
  // Construye (o reconstruye) el índice de este material y lo archiva. Emite progreso por el camino.
  // Bajo demanda: lo dispara la persona desde la interfaz (paso 22 del plan de la fase 1).
  readonly reindex: (
    id: string,
    onProgress: (progress: IndexProgress) => Effect.Effect<void>
  ) => Effect.Effect<
    MaterialIndex,
    MaterialNotFound | MaterialIndexingFailed | MaterialRepositoryError,
    LanguageModel.LanguageModel
  >;
}

export class MaterialIndexingFailed extends Data.TaggedError("MaterialIndexingFailed")<{
  readonly materialId: string;
  readonly reason: string;
}> {}

export const MaterialRepository = Context.Service<MaterialRepository>(
  "@proxus/server/materials/MaterialRepository"
);

export const parsePageSelection = (
  selection: string
): Effect.Effect<readonly number[], InvalidPageRange | TooManyPages> => Effect.gen(function* () {
  const pages = new Set<number>();
  const parts = selection.split(",").map((part) => part.trim()).filter((part) => part.length > 0);

  if (parts.length === 0) {
    return yield* new InvalidPageRange({ range: selection, reason: "Expected pages like 10 or 13-20" });
  }

  for (const part of parts) {
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch !== null) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
        return yield* new InvalidPageRange({ range: selection, reason: `Invalid range: ${part}` });
      }
      for (let page = start; page <= end; page++) {
        pages.add(page);
      }
      continue;
    }

    const page = Number(part);
    if (!Number.isSafeInteger(page) || page < 1) {
      return yield* new InvalidPageRange({ range: selection, reason: `Invalid page: ${part}` });
    }
    pages.add(page);
  }

  if (pages.size > LIMITS.maxPagesPerTurn) {
    return yield* new TooManyPages({ requested: pages.size, ceiling: LIMITS.maxPagesPerTurn });
  }

  return [...pages].sort((a, b) => a - b);
});

export const isMaterialPageImages = (value: unknown): value is MaterialPageImages => {
  if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "material-page-images") {
    return false;
  }

  const candidate = value as { readonly pages?: unknown };
  return Array.isArray(candidate.pages);
};
