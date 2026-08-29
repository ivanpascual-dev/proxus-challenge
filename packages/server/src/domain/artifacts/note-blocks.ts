import { Option, Result } from "effect";
import {
  BlockNotFound,
  LIMITS,
  NoteLimitExceeded,
  ProposalNotFound,
  ProposalStale,
  TooManyProposals,
  UnknownBlock
} from "@proxus/shared";
import type { NoteArtifact, NoteBlock, NoteBlockInput, NoteProposal, NoteProposalOperation, SaveNoteInput } from "./artifact.ts";

// Lógica pura del apunte por bloques. Sin entrada ni salida: es donde, si algo falla, falla en
// silencio, así que es donde van los tests.

// De la fuente que manda quien escribe a la fuente guardada. El `excerpt` de una fuente de material
// lo rellena el servidor desde el índice (invariante 8, decisión 4); aquí se deja en null y lo
// completa `resolveSources` (tramo 2B). Una fuente de URL ya viene entera del endpoint de URL.
export const resolveInputSource = (source: NoteBlockInput["source"]): NoteBlock["source"] => {
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

// --- Propuestas del tutor (tramo 2D, ADR-014) ---------------------------------------------------
//
// El tutor propone; nunca aplica. Una propuesta se guarda como pendiente dentro del apunte y no
// toca ningún bloque hasta que el alumno la acepta desde la interfaz. `applyProposal` y
// `rejectProposal` son las dos operaciones del alumno; `addProposal` es la del tutor.

// Añade una propuesta comprobando el techo de pendientes (invariante 11). El primero que se pasa
// del techo se rechaza nombrándolo (F2-30).
export const addProposal = (
  note: NoteArtifact,
  proposal: NoteProposal
): Result.Result<NoteArtifact, TooManyProposals> => {
  if (note.proposals.length >= LIMITS.maxPendingProposalsPerNote) {
    return Result.fail(new TooManyProposals({
      ceiling: LIMITS.maxPendingProposalsPerNote,
      received: note.proposals.length + 1,
      message: `El apunte ya tiene ${note.proposals.length} propuestas pendientes; el techo es ${LIMITS.maxPendingProposalsPerNote}.`
    }));
  }
  return Result.succeed({ ...note, proposals: [...note.proposals, proposal] });
};

// Del `operation` que manda el tutor (sin `baseMarkdown`) a la operación que se guarda en la
// propuesta. El tutor no reproduce el texto viejo del bloque: lo pone el servidor con el texto
// actual, así la propuesta queda anclada a la versión real y no a lo que el modelo transcribió
// (ADR-014, enmienda 2026-08-29). El caso `insert` lo arma el servicio: necesita resolver la fuente
// desde el índice, que es E/S.
export const bindProposalTarget = (
  blocks: readonly NoteBlock[],
  operation:
    | { readonly type: "replace"; readonly blockId: string; readonly markdown: string }
    | { readonly type: "remove"; readonly blockId: string }
): Result.Result<NoteProposalOperation, BlockNotFound> => {
  const target = blocks.find((candidate) => candidate.id === operation.blockId);
  if (target === undefined) {
    return Result.fail(new BlockNotFound({
      blockId: operation.blockId,
      message: `El apunte no tiene ningún bloque con id ${operation.blockId}.`
    }));
  }
  if (operation.type === "replace") {
    return Result.succeed({
      type: "replace",
      blockId: operation.blockId,
      markdown: operation.markdown,
      baseMarkdown: target.markdown
    });
  }
  return Result.succeed({ type: "remove", blockId: operation.blockId, baseMarkdown: target.markdown });
};

// Retira una propuesta sin aplicarla (F2-28).
export const rejectProposal = (
  note: NoteArtifact,
  proposalId: string
): Result.Result<NoteArtifact, ProposalNotFound> => {
  if (note.proposals.every((proposal) => proposal.id !== proposalId)) {
    return Result.fail(new ProposalNotFound({
      proposalId,
      message: `El apunte no tiene ninguna propuesta pendiente con id ${proposalId}.`
    }));
  }
  return Result.succeed({
    ...note,
    proposals: note.proposals.filter((proposal) => proposal.id !== proposalId)
  });
};

const staleAgainst = (
  proposalId: string,
  blockId: string,
  seen: string,
  block: NoteBlock | undefined
): Option.Option<ProposalStale> => {
  if (block !== undefined && block.markdown === seen) {
    return Option.none();
  }
  return Option.some(new ProposalStale({
    proposalId,
    blockId,
    seen,
    current: block?.markdown ?? "(el bloque ya no está en el apunte)",
    message: `El bloque ${blockId} ha cambiado desde que el tutor propuso este cambio; revisa los dos textos y vuelve a pedírselo si hace falta.`
  }));
};

// Aplica insert, replace o remove y retira la propuesta de las pendientes (F2-28). Para replace y
// remove comprueba `baseMarkdown`: si el bloque cambió desde que el tutor lo vio, se rechaza con
// `ProposalStale` y no se aplica nada (F2-29). Conservador a propósito: un espacio de más ya caduca
// la propuesta (riesgo 5 del plan).
export const applyProposal = (
  note: NoteArtifact,
  proposalId: string
): Result.Result<NoteArtifact, ProposalNotFound | ProposalStale> => {
  const proposal = note.proposals.find((candidate) => candidate.id === proposalId);
  if (proposal === undefined) {
    return Result.fail(new ProposalNotFound({
      proposalId,
      message: `El apunte no tiene ninguna propuesta pendiente con id ${proposalId}.`
    }));
  }

  const remaining = note.proposals.filter((candidate) => candidate.id !== proposalId);
  const operation = proposal.operation;

  if (operation.type === "insert") {
    const block: NoteBlock = { ...operation.block, id: crypto.randomUUID() };
    if (operation.afterBlockId === null) {
      return Result.succeed({ ...note, blocks: [block, ...note.blocks], proposals: remaining });
    }
    const at = note.blocks.findIndex((candidate) => candidate.id === operation.afterBlockId);
    if (at === -1) {
      return Result.fail(new ProposalStale({
        proposalId,
        blockId: operation.afterBlockId,
        seen: operation.afterBlockId,
        current: "(el bloque tras el que se iba a insertar ya no está en el apunte)",
        message: `La propuesta insertaba un bloque tras ${operation.afterBlockId}, que ya no está en el apunte.`
      }));
    }
    const blocks = [...note.blocks.slice(0, at + 1), block, ...note.blocks.slice(at + 1)];
    return Result.succeed({ ...note, blocks, proposals: remaining });
  }

  const target = note.blocks.find((candidate) => candidate.id === operation.blockId);
  const stale = staleAgainst(proposalId, operation.blockId, operation.baseMarkdown, target);
  if (Option.isSome(stale)) {
    return Result.fail(stale.value);
  }

  if (operation.type === "replace") {
    const blocks = note.blocks.map((candidate) =>
      candidate.id === operation.blockId ? { ...candidate, markdown: operation.markdown } : candidate
    );
    return Result.succeed({ ...note, blocks, proposals: remaining });
  }

  const blocks = note.blocks.filter((candidate) => candidate.id !== operation.blockId);
  return Result.succeed({ ...note, blocks, proposals: remaining });
};
