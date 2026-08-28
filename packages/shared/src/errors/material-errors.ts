import { Schema } from "effect";

// Errores declarados de los endpoints de materiales (ADR-005, invariante 6: nada de orDie en
// handlers nuevos). El handler los mapea al código que dice la tabla de la sección 4.14 del plan.

export class MaterialNotFound extends Schema.ErrorClass<MaterialNotFound>("MaterialNotFound")({
  _tag: Schema.tag("MaterialNotFound"),
  materialId: Schema.String,
  message: Schema.String
}) {}

// No hay índice para el contenido exacto de este PDF. No es "caducado" (ADR-011): o hay índice para
// este contenido, o hay que construirlo.
export class MaterialNotIndexed extends Schema.ErrorClass<MaterialNotIndexed>("MaterialNotIndexed")({
  _tag: Schema.tag("MaterialNotIndexed"),
  materialId: Schema.String,
  message: Schema.String
}) {}

export class PageOutOfRange extends Schema.ErrorClass<PageOutOfRange>("PageOutOfRange")({
  _tag: Schema.tag("PageOutOfRange"),
  materialId: Schema.String,
  page: Schema.Number,
  pageCount: Schema.Number,
  message: Schema.String
}) {}

// Falló la construcción del índice (p. ej. el modelo no devolvió temas parseables). No se guarda
// nada: reintentar es válido.
export class MaterialIndexingFailed extends Schema.ErrorClass<MaterialIndexingFailed>("MaterialIndexingFailed")({
  _tag: Schema.tag("MaterialIndexingFailed"),
  materialId: Schema.String,
  message: Schema.String
}) {}

// El almacenamiento de materiales falló al leer (disco ilegible, índice archivado corrupto). No es
// culpa de la petición, así que es 500, pero declarado y con cuerpo, nunca un orDie mudo: la
// invariante 11 exige que el fallo diga qué pasó (ADR-005, invariante 6).
export class MaterialStorageError extends Schema.ErrorClass<MaterialStorageError>("MaterialStorageError")({
  _tag: Schema.tag("MaterialStorageError"),
  materialId: Schema.String,
  message: Schema.String
}) {}
