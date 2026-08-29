import { Option, Result } from "effect";
import { LIMITS, NoteLimitExceeded, UnknownBlock } from "@proxus/shared";
import type { NoteBlock, NoteBlockInput, SaveNoteInput } from "./artifact.ts";

// Lógica pura del apunte por bloques. Sin entrada ni salida: es donde, si algo falla, falla en
// silencio, así que es donde van los tests.

// De la fuente que manda quien escribe a la fuente guardada. El `excerpt` de una fuente de material
// lo rellena el servidor desde el índice (invariante 8, decisión 4); aquí se deja en null y lo
// completa `resolveSources` (tramo 2B). Una fuente de URL ya viene entera del endpoint de URL.
const resolveInputSource = (source: NoteBlockInput["source"]): NoteBlock["source"] => {
  if (source === null) {
    return null;
  }
  if (source.type === "url") {
    return source;
  }
  return {
    type: "material",
    materialId: source.materialId,
    pages: source.pages,
    excerpt: null,
    excerptTruncated: false,
    transcribed: false,
    unanchoredReason: null
  };
};

// Techos de título, número de bloques y caracteres por bloque. Devuelve el primero que se cruza con
// el techo, lo recibido y (si aplica) el bloque afectado. Nada se guarda si esto devuelve Some.
export const checkNoteLimits = (input: SaveNoteInput): Option.Option<NoteLimitExceeded> => {
  if (input.title.length > LIMITS.maxNoteTitleCharacters) {
    return Option.some(new NoteLimitExceeded({
      limit: "maxNoteTitleCharacters",
      ceiling: LIMITS.maxNoteTitleCharacters,
      received: input.title.length,
      blockId: null,
      message: `El título no puede pasar de ${LIMITS.maxNoteTitleCharacters} caracteres; tiene ${input.title.length}.`
    }));
  }

  if (input.blocks.length > LIMITS.maxBlocksPerNote) {
    return Option.some(new NoteLimitExceeded({
      limit: "maxBlocksPerNote",
      ceiling: LIMITS.maxBlocksPerNote,
      received: input.blocks.length,
      blockId: null,
      message: `Un apunte no puede pasar de ${LIMITS.maxBlocksPerNote} bloques; se enviaron ${input.blocks.length}.`
    }));
  }

  for (const block of input.blocks) {
    if (block.markdown.length > LIMITS.maxBlockCharacters) {
      return Option.some(new NoteLimitExceeded({
        limit: "maxBlockCharacters",
        ceiling: LIMITS.maxBlockCharacters,
        received: block.markdown.length,
        blockId: block.id ?? null,
        message: `El bloque ${block.id ?? "(nuevo)"} tiene ${block.markdown.length} caracteres; el techo es ${LIMITS.maxBlockCharacters}.`
      }));
    }
  }

  return Option.none();
};

// Casa los bloques enviados con los guardados: id presente lo conserva, id ausente genera uno nuevo,
// id desconocido se rechaza (casar contra una clave que no es produce un apunte bien formado y
// falso). El orden de salida es el de `inputs`.
export const applyBlockInputs = (
  previous: readonly NoteBlock[],
  inputs: readonly NoteBlockInput[]
): Result.Result<readonly NoteBlock[], UnknownBlock> => {
  const known = new Set(previous.map((block) => block.id));
  const next: NoteBlock[] = [];

  for (const input of inputs) {
    if (input.id !== undefined && !known.has(input.id)) {
      return Result.fail(new UnknownBlock({
        blockId: input.id,
        message: `El apunte no tiene ningún bloque con id ${input.id}.`
      }));
    }

    next.push({
      id: input.id ?? crypto.randomUUID(),
      markdown: input.markdown,
      author: input.author,
      emphasis: input.emphasis,
      source: resolveInputSource(input.source)
    });
  }

  return Result.succeed(next);
};
