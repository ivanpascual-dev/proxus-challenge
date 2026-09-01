import { Context, Data, Effect } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { LIMITS, type MaterialIndex, type MaterialIndexState } from "@proxus/shared";
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

export class MaterialRepositoryError extends Data.TaggedError("MaterialRepositoryError")<{
  readonly reason: unknown;
}> {}

// Errores de la subida (fase 4, tramo 4D). Fallo por fichero: viaja dentro del resultado de ESE
// fichero, no aborta el resto del lote (F4-02). El contentType que manda el navegador no se cree
// (asunción A1): esto es lo que sale cuando los bytes mágicos `%PDF-` o `pdfinfo` rechazan el
// fichero.
export class UnsupportedFileType extends Data.TaggedError("UnsupportedFileType")<{
  readonly fileName: string;
  readonly reason: string;
}> {}

// Nombre de fichero repetido. El materialId sale del nombre del fichero (ADR-011); sobreescribir
// cambiaría el material al que apuntan citas ya escritas, así que se rechaza en voz alta.
export class MaterialAlreadyExists extends Data.TaggedError("MaterialAlreadyExists")<{
  readonly fileName: string;
  readonly materialId: string;
}> {}

// Fallo agregado: los materiales que ya existen más los que trae la subida pasan de `maxMaterials`.
// Aborta la petición entera, antes de escribir nada (F4-04).
export class TooManyMaterials extends Data.TaggedError("TooManyMaterials")<{
  readonly limit: number;
  readonly existing: number;
  readonly requested: number;
}> {}

export interface UploadCandidate {
  readonly fileName: string; // nombre original que mandó el navegador
  readonly path: string; // ruta al fichero persistido; solo válida mientras dure la petición
}

export type MaterialUploadOutcome =
  | { readonly fileName: string; readonly outcome: "created"; readonly material: PdfMaterial }
  | {
      readonly fileName: string;
      readonly outcome: "rejected";
      readonly reason: UnsupportedFileType | MaterialAlreadyExists;
    };

// El mismo rechazo por fichero que `upload` (tipo, nombre duplicado), pero sin escribir nada a disco:
// deja que la interfaz avise antes de que la persona pulse "Subir" (fase 4, cierre, punto 5 de la
// revisión de fiel-al-plan). No comprueba `maxMaterials` (fallo agregado, no por fichero): ese techo
// se comprueba en `upload`, que es quien de verdad va a crear los materiales.
export type MaterialValidationOutcome =
  | { readonly fileName: string; readonly outcome: "valid" }
  | {
      readonly fileName: string;
      readonly outcome: "rejected";
      readonly reason: UnsupportedFileType | MaterialAlreadyExists;
    };

export interface RenderedPage {
  readonly material: PdfMaterial;
  readonly image: PageImage;
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
  // Sube un lote de PDFs. `TooManyMaterials` aborta la petición entera antes de escribir nada; el
  // resto de rechazos (tipo, nombre duplicado) viajan por fichero dentro del resultado (F4-02).
  readonly upload: (
    candidates: readonly UploadCandidate[]
  ) => Effect.Effect<readonly MaterialUploadOutcome[], TooManyMaterials | MaterialRepositoryError>;
  // Los mismos rechazos por fichero que `upload` comprobaría, en modo consulta: nada se escribe.
  readonly validate: (
    candidates: readonly UploadCandidate[]
  ) => Effect.Effect<readonly MaterialValidationOutcome[], MaterialRepositoryError>;
  // Borra el PDF. Solo el fichero: el índice cacheado por huella de contenido se queda (es una
  // optimización compartida, no algo del usuario) y los artefactos del material los borra
  // `MaterialDeletionService`, que orquesta las dos cosas.
  readonly remove: (id: string) => Effect.Effect<void, MaterialNotFound | MaterialRepositoryError>;
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
