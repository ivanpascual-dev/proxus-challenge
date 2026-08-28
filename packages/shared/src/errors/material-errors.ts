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
