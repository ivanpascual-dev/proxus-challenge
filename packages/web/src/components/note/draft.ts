import type { NoteArtifact, NoteBlock, NoteBlockInput, SaveNoteInput } from "@proxus/shared";

// El bloque tal y como lo edita la interfaz. `key` es estable en el cliente (para React y para
// reordenar); `id` presente significa que el servidor ya lo guardó, ausente que es nuevo.
export interface DraftBlock {
  readonly key: string;
  readonly id: string | undefined;
  readonly markdown: string;
  readonly author: NoteBlock["author"];
  readonly emphasis: boolean;
  readonly source: NoteBlock["source"];
}

export interface NoteDraft {
  readonly title: string;
  readonly blocks: readonly DraftBlock[];
}

let counter = 0;
export const nextKey = () => {
  counter += 1;
  return `draft-${counter}`;
};

export const draftFromArtifact = (artifact: NoteArtifact): NoteDraft => ({
  title: artifact.title,
  blocks: artifact.blocks.map((block) => ({
    key: nextKey(),
    id: block.id,
    markdown: block.markdown,
    author: block.author,
    emphasis: block.emphasis,
    source: block.source
  }))
});

// De la fuente guardada a la fuente que espera el servidor: sin `excerpt`, que rellena él desde el
// índice o la URL (invariante 8).
const toInputSource = (source: DraftBlock["source"]): NoteBlockInput["source"] => {
  if (source === null) {
    return null;
  }
  if (source.type === "url") {
    return source;
  }
  return { type: "material", materialId: source.materialId, pages: source.pages };
};

export const draftToSaveInput = (draft: NoteDraft): SaveNoteInput => ({
  title: draft.title,
  blocks: draft.blocks.map((block) => ({
    ...(block.id === undefined ? {} : { id: block.id }),
    markdown: block.markdown,
    author: block.author,
    emphasis: block.emphasis,
    source: toInputSource(block.source)
  }))
});
