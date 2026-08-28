import { Schema } from "effect";
import { PageImage } from "./material.ts";

// De dónde salió el texto indexado de una página. La invariante 8: "extracted" es el texto embebido
// del PDF; "transcribed" lo escribió el modelo mirando la imagen, y eso hay que poder verlo.
export const PageProvenance = Schema.Union([
  Schema.Literal("extracted"),
  Schema.Literal("transcribed")
]);
export type PageProvenance = typeof PageProvenance.Type;

// Un tema es una unidad de estudio del material. `pages` son las páginas donde se trata de verdad.
export const MaterialTopic = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  pages: Schema.Array(Schema.Number)
});
export type MaterialTopic = typeof MaterialTopic.Type;

export const IndexedPage = Schema.Struct({
  page: Schema.Number,
  provenance: PageProvenance,
  text: Schema.String,
  denseCharacters: Schema.Number,
  topicIds: Schema.Array(Schema.String)
});
export type IndexedPage = typeof IndexedPage.Type;

// Una página que no se pudo indexar se guarda con su motivo, nunca como texto vacío: texto vacío es
// indistinguible de una página en blanco (invariante 3, no al fallo silencioso).
export const UnindexedPage = Schema.Struct({
  page: Schema.Number,
  reason: Schema.String
});
export type UnindexedPage = typeof UnindexedPage.Type;

// Lo que se GUARDA en disco. Archivado por contenido (sha256 del PDF, ADR-011), así que solo contiene
// lo que se deriva del contenido: nada de materialId ni fileName, porque dos ficheros con distinto
// nombre pueden tener el mismo contenido.
export const MaterialIndexContent = Schema.Struct({
  contentHash: Schema.String,
  pageCount: Schema.Number,
  indexedAt: Schema.String,
  threshold: Schema.Number,
  topics: Schema.Array(MaterialTopic),
  pages: Schema.Array(IndexedPage),
  failedPages: Schema.Array(UnindexedPage)
});
export type MaterialIndexContent = typeof MaterialIndexContent.Type;

// Lo que se DEVUELVE por HTTP: el contenido más la identidad, resuelta al leer contra el fichero que
// hoy tiene esa huella.
export const MaterialIndex = Schema.Struct({
  ...MaterialIndexContent.fields,
  materialId: Schema.String,
  fileName: Schema.String
});
export type MaterialIndex = typeof MaterialIndex.Type;

// Lo que devuelve GET /materials/:id/pages/:page: la imagen real de la página y su entrada de índice,
// que puede ser una página indexada o una que no se pudo indexar (con su motivo). La invariante 8:
// el texto indexado no es la verdad, la página sí.
export const MaterialPageEntry = Schema.Union([IndexedPage, UnindexedPage]);
export type MaterialPageEntry = typeof MaterialPageEntry.Type;

export const MaterialPageView = Schema.Struct({
  image: PageImage,
  entry: MaterialPageEntry
});
export type MaterialPageView = typeof MaterialPageView.Type;

// Eventos del stream NDJSON de POST /materials/:id/index. `page` es null en la fase de temas.
export const MaterialIndexStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("progress"),
    page: Schema.NullOr(Schema.Number),
    pageCount: Schema.Number,
    message: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("done"),
    index: MaterialIndex
  }),
  Schema.Struct({
    type: Schema.Literal("failed"),
    message: Schema.String
  })
]);
export type MaterialIndexStreamEvent = typeof MaterialIndexStreamEvent.Type;
