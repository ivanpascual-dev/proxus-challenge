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

// Errores de la subida (fase 4). Fallo por fichero: no aborta el resto del lote, viaja dentro del
// resultado de ESE fichero en la respuesta 200 de `POST /materials` (F4-02, "el PDF bueno sigue su
// cadena"). El contentType que manda el navegador no se cree (asunción A1): esto es lo que sale
// cuando los bytes mágicos `%PDF-` o `pdfinfo` rechazan el fichero.
export class UnsupportedFileType extends Schema.ErrorClass<UnsupportedFileType>("UnsupportedFileType")({
  _tag: Schema.tag("UnsupportedFileType"),
  fileName: Schema.String,
  message: Schema.String
}) {}

// Nombre de fichero repetido. Fallo por fichero, no sobreescribe (ADR-011: el materialId sale del
// nombre del fichero, y sobreescribir cambiaría el material al que apuntan citas ya escritas).
export class MaterialAlreadyExists extends Schema.ErrorClass<MaterialAlreadyExists>("MaterialAlreadyExists")({
  _tag: Schema.tag("MaterialAlreadyExists"),
  fileName: Schema.String,
  materialId: Schema.String,
  message: Schema.String
}) {}

// La petición entera se rechaza antes de escribir nada (F4-03, F4-04): los materiales que ya existen
// más los que trae la subida pasan de `maxMaterials`. Nombra cuántos caben y cuántos hay.
export class TooManyMaterials extends Schema.ErrorClass<TooManyMaterials>("TooManyMaterials")({
  _tag: Schema.tag("TooManyMaterials"),
  limit: Schema.Number,
  existing: Schema.Number,
  requested: Schema.Number,
  message: Schema.String
}) {}
