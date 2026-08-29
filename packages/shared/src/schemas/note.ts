import { Schema } from "effect";

// De dónde salió un bloque. `excerpt` es el fragmento cacheado: lo copia el SERVIDOR del índice o de
// la URL, nunca el modelo (invariante 8). `unanchoredReason` no nulo significa que la cita no se pudo
// comprobar: el bloque se guarda igual y se ve marcado (invariante 3).
export const MaterialBlockSource = Schema.Struct({
  type: Schema.Literal("material"),
  materialId: Schema.String,
  pages: Schema.Array(Schema.Number),
  excerpt: Schema.NullOr(Schema.String),
  excerptTruncated: Schema.Boolean,
  transcribed: Schema.Boolean, // alguna página citada la transcribió el modelo (ADR-001)
  unanchoredReason: Schema.NullOr(Schema.String)
});
export type MaterialBlockSource = typeof MaterialBlockSource.Type;

export const UrlBlockSource = Schema.Struct({
  type: Schema.Literal("url"),
  url: Schema.String,
  fetchedAt: Schema.String,
  title: Schema.String,
  excerpt: Schema.String,
  excerptTruncated: Schema.Boolean
});
export type UrlBlockSource = typeof UrlBlockSource.Type;

export const BlockSource = Schema.Union([MaterialBlockSource, UrlBlockSource]);
export type BlockSource = typeof BlockSource.Type;

export const BlockAuthor = Schema.Union([Schema.Literal("tutor"), Schema.Literal("student")]);
export type BlockAuthor = typeof BlockAuthor.Type;

export const NoteBlock = Schema.Struct({
  id: Schema.String,
  markdown: Schema.String,
  author: BlockAuthor,
  emphasis: Schema.Boolean, // señal separada (ADR-003), nunca sumada a nada
  source: Schema.NullOr(BlockSource)
});
export type NoteBlock = typeof NoteBlock.Type;

// Lo que el tutor propone. Nunca se aplica sola: la aplica el alumno desde la interfaz.
// `baseMarkdown` es el texto que el tutor vio, para detectar la propuesta caducada (decisión 11).
export const NoteProposalOperation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("insert"), afterBlockId: Schema.NullOr(Schema.String), block: NoteBlock }),
  Schema.Struct({ type: Schema.Literal("replace"), blockId: Schema.String, markdown: Schema.String, baseMarkdown: Schema.String }),
  Schema.Struct({ type: Schema.Literal("remove"), blockId: Schema.String, baseMarkdown: Schema.String })
]);
export type NoteProposalOperation = typeof NoteProposalOperation.Type;

export const NoteProposal = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  rationale: Schema.String, // una frase: por qué lo propone
  operation: NoteProposalOperation
});
export type NoteProposal = typeof NoteProposal.Type;

// La fuente tal y como la manda quien escribe (interfaz o tutor): sin `excerpt`, que rellena el
// servidor desde el índice o la URL.
export const NoteBlockInputSource = Schema.NullOr(Schema.Union([
  Schema.Struct({ type: Schema.Literal("material"), materialId: Schema.String, pages: Schema.Array(Schema.Number) }),
  UrlBlockSource
]));
export type NoteBlockInputSource = typeof NoteBlockInputSource.Type;

// Lo que se manda al guardar. Sin ids que el servidor genera y sin `excerpt`, que rellena el servidor.
export const NoteBlockInput = Schema.Struct({
  id: Schema.optional(Schema.String), // ausente = bloque nuevo
  markdown: Schema.String,
  author: BlockAuthor,
  emphasis: Schema.Boolean,
  source: NoteBlockInputSource
});
export type NoteBlockInput = typeof NoteBlockInput.Type;

export const SaveNoteInput = Schema.Struct({
  title: Schema.String,
  blocks: Schema.Array(NoteBlockInput)
});
export type SaveNoteInput = typeof SaveNoteInput.Type;
