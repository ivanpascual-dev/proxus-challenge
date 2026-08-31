import { Schema } from "effect";
import { MaterialAlreadyExists, UnsupportedFileType } from "../errors/material-errors.ts";

// "indexed" si hay un índice archivado para el contenido exacto de este PDF (ADR-011). Lo calcula
// `list` en una sola pasada (sha256 del fichero), para que la barra lateral no tenga que pedir el
// índice de cada material por separado (criterio F1-16).
export const MaterialIndexState = Schema.Union([
  Schema.Literal("indexed"),
  Schema.Literal("not-indexed")
]);
export type MaterialIndexState = typeof MaterialIndexState.Type;

export const PdfMaterial = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  fileName: Schema.String,
  pageCount: Schema.Number,
  uploadedAt: Schema.String,
  indexState: MaterialIndexState
});
export type PdfMaterial = typeof PdfMaterial.Type;

export const PageImage = Schema.Struct({
  page: Schema.Number,
  mediaType: Schema.Literal("image/png"),
  data: Schema.String
});
export type PageImage = typeof PageImage.Type;

export const MaterialPageImages = Schema.Struct({
  type: Schema.Literal("material-page-images"),
  material: PdfMaterial,
  pages: Schema.Array(PageImage)
});
export type MaterialPageImages = typeof MaterialPageImages.Type;

export const MaterialListResponse = Schema.Struct({
  materials: Schema.Array(PdfMaterial)
});
export type MaterialListResponse = typeof MaterialListResponse.Type;

// El resultado de la subida es por fichero (F4-02: un fichero inválido no tumba a los demás del mismo
// lote). Solo los fallos agregados (frecuencia, `maxFilesPerUpload`, `maxMaterials`) abortan la
// petición entera como error HTTP; el tipo de fichero y el nombre duplicado son por fichero y viajan
// aquí dentro, nunca como excepción silenciosa (invariante 6).
export const MaterialUploadResult = Schema.Union([
  Schema.Struct({
    fileName: Schema.String,
    outcome: Schema.Literal("created"),
    material: PdfMaterial
  }),
  Schema.Struct({
    fileName: Schema.String,
    outcome: Schema.Literal("rejected"),
    reason: Schema.Union([UnsupportedFileType, MaterialAlreadyExists])
  })
]);
export type MaterialUploadResult = typeof MaterialUploadResult.Type;

export const MaterialUploadResponse = Schema.Struct({
  results: Schema.Array(MaterialUploadResult)
});
export type MaterialUploadResponse = typeof MaterialUploadResponse.Type;
