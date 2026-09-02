import { useAtomSet } from "@effect/atom-react";
import { LIMITS, type Artifact, type UrlSourceResult } from "@proxus/shared";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { saveNoteAction } from "../../domain/artifacts/atoms.ts";
import { findBlockForTopic } from "../../domain/materials/note-target.ts";
import type { FoldAllCommand } from "../../domain/workspace/layout.ts";
import { AddFromUrl } from "./AddFromUrl.tsx";
import { NoteOutline } from "./NoteOutline.tsx";
import { SelectedNoteBlock } from "./SelectedNoteBlock.tsx";
import { ProposalCard } from "./ProposalCard.tsx";
import {
  draftFromArtifact,
  draftToSaveInput,
  nextKey,
  type DraftBlock,
  type NoteDraft
} from "./draft.ts";
import { describeFailure } from "../../lib/user-feedback.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Icon } from "../ui/Icon.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { StatusNotice } from "../ui/StatusNotice.tsx";
import { ActionButton } from "../ui/ActionButton.tsx";

type NoteArtifact = Extract<Artifact, { readonly kind: "note" }>;

interface NoteWorkspaceProps {
  readonly artifact: NoteArtifact;
  readonly onOpenCitation: (materialId: string, page: number) => void;
  // Tema -> apunte (decisión 18, §4.1): páginas del tema pulsado en el mapa. Se consume una vez.
  readonly requestedTopicPages: readonly number[] | null;
  readonly onRequestedTopicPagesConsumed: () => void;
  // Borrar el apunte entero vive en la misma fila que el título (feedback de Iván): título, borrar,
  // guardar y el estado de guardado a la misma altura, sin una fila propia encima ni un pie aparte.
  readonly onDelete: () => void;
  readonly deleting: boolean;
  // `Plegar todo` de la cabecera del material también recoge el índice de bloques (petición de Iván):
  // leer un apunte a solas es leerlo sin las tres superficies laterales, no sin dos. Llega como orden
  // con marca, no como estado: desplegar solo a Sym desde su rail no debe abrir este índice.
  readonly foldAll: FoldAllCommand | null;
}

export function NoteWorkspace({
  artifact,
  onOpenCitation,
  requestedTopicPages,
  onRequestedTopicPagesConsumed,
  onDelete,
  deleting,
  foldAll
}: NoteWorkspaceProps) {
  const [draft, setDraft] = useState<NoteDraft>(() => draftFromArtifact(artifact));
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedKey, setSelectedKey] = useState<string | null>(() => draftFromArtifact(artifact).blocks[0]?.key ?? null);
  const [noteTargetNotice, setNoteTargetNotice] = useState<string | null>(null);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  // Plan de correcciones §4.2.8 / C5-14: el rail del índice de bloques. No se persiste (dura mientras
  // este workspace esté montado) y contraer no desmonta el editor ni toca `draft` ni la selección.
  const [outlineCollapsed, setOutlineCollapsed] = useState(() => foldAll?.collapsed ?? false);
  // Solo una orden nueva mueve el índice: después el alumno sigue mandando sobre su propio rail sin
  // que nada se lo vuelva a imponer.
  const lastFoldSeqRef = useRef(foldAll?.seq ?? 0);
  const save = useAtomSet(saveNoteAction, { mode: "promise" });

  useEffect(() => {
    if (foldAll !== null && foldAll.seq !== lastFoldSeqRef.current) {
      lastFoldSeqRef.current = foldAll.seq;
      setOutlineCollapsed(foldAll.collapsed);
    }
  }, [foldAll]);

  // Cuando el artefacto cambia por debajo (aceptar o descartar una propuesta refresca el apunte) y
  // no hay cambios sin guardar, se recarga el borrador para reflejar el bloque nuevo. Con cambios
  // sin guardar no se toca: aceptar una propuesta está bloqueado en ese caso.
  useEffect(() => {
    if (!dirty) {
      setDraft(draftFromArtifact(artifact));
    }
  }, [artifact, dirty]);

  // La selección sigue viva mientras su bloque exista; si no (se borró, o el borrador se recargó),
  // cae al primero. No descarta el borrador ni llama a la API (decisión: cambiar de bloque conserva
  // el borrador global).
  useEffect(() => {
    setSelectedKey((current) => (current !== null && draft.blocks.some((block) => block.key === current)
      ? current
      : draft.blocks[0]?.key ?? null));
  }, [draft.blocks]);

  useEffect(() => {
    if (requestedTopicPages === null) {
      return;
    }
    const targetBlockId = findBlockForTopic(artifact.blocks, artifact.materialId, requestedTopicPages);
    if (targetBlockId === null) {
      setNoteTargetNotice("Este tema todavía no tiene un bloque de apuntes vinculado.");
    } else {
      setNoteTargetNotice(null);
      const targetKey = draft.blocks.find((block) => block.id === targetBlockId)?.key;
      if (targetKey !== undefined) {
        setSelectedKey(targetKey);
      }
    }
    onRequestedTopicPagesConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTopicPages]);

  const overLimitCount = useMemo(
    () => draft.blocks.filter((block) => block.markdown.length > LIMITS.maxBlockCharacters).length,
    [draft.blocks]
  );
  const titleOverLimit = draft.title.length > LIMITS.maxNoteTitleCharacters;
  const tooManyBlocks = draft.blocks.length > LIMITS.maxBlocksPerNote;
  const canSave = dirty && !isSaving && overLimitCount === 0 && !titleOverLimit && !tooManyBlocks;

  const update = (blocks: readonly DraftBlock[]) => {
    setDraft((current) => ({ ...current, blocks }));
    setDirty(true);
  };

  const patchBlock = (key: string, patch: Partial<DraftBlock>) => {
    update(draft.blocks.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  };

  const insertAfterSelected = (block: DraftBlock) => {
    const selectedIndex = draft.blocks.findIndex((candidate) => candidate.key === selectedKey);
    const insertAt = selectedIndex === -1 ? draft.blocks.length : selectedIndex + 1;
    update([...draft.blocks.slice(0, insertAt), block, ...draft.blocks.slice(insertAt)]);
    setSelectedKey(block.key);
  };

  const addBlock = () => {
    insertAfterSelected({
      key: nextKey(),
      id: undefined,
      markdown: "",
      author: "student",
      emphasis: false,
      source: null
    });
  };

  const addBlockFromUrl = ({ source, draft: body }: UrlSourceResult) => {
    insertAfterSelected({
      key: nextKey(),
      id: undefined,
      markdown: body ?? "",
      // Si el modelo redactó el borrador, la autoría es del tutor; si no, el bloque nace vacío y es tuyo.
      author: body !== null ? "tutor" : "student",
      emphasis: false,
      source
    });
  };

  const deleteBlock = (key: string) => {
    const index = draft.blocks.findIndex((block) => block.key === key);
    if (index === -1) {
      return;
    }
    const remaining = draft.blocks.filter((block) => block.key !== key);
    update(remaining);
    // Selecciona el siguiente; si el borrado era el último, el anterior (decisión §4.8).
    setSelectedKey(remaining.length === 0 ? null : remaining[Math.min(index, remaining.length - 1)]!.key);
  };

  const onProposalsToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) {
      return;
    }
    const first = artifact.proposals[0];
    if (first === undefined) {
      return;
    }
    const targetBlockId = first.operation.type === "insert" ? first.operation.afterBlockId : first.operation.blockId;
    if (targetBlockId === null) {
      return;
    }
    const targetKey = draft.blocks.find((block) => block.id === targetBlockId)?.key;
    if (targetKey !== undefined) {
      setSelectedKey(targetKey);
    }
  };

  const onSave = async () => {
    if (!canSave) {
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      const saved = await save({ id: artifact.id, input: draftToSaveInput(draft) });
      if (saved.kind === "note") {
        setDraft(draftFromArtifact(saved));
      }
      setDirty(false);
    } catch (cause) {
      const notice = describeFailure(cause, { area: "notes", action: "save" }, "NoteWorkspace");
      setError(notice.description ?? notice.title);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedBlock = draft.blocks.find((block) => block.key === selectedKey);

  return (
    <article className="flex min-h-0 w-full flex-1 flex-col">
      <header className="mb-2 flex shrink-0 items-center gap-3">
        <input
          className="min-w-0 flex-1 border-transparent border-b bg-transparent py-0.5 text-muted text-sm outline-none transition hover:border-border focus:border-brand focus:text-heading"
          value={draft.title}
          onChange={(event) => {
            // Se lee ya, no dentro del updater: React anula `currentTarget` al retornar el handler.
            const title = event.currentTarget.value;
            setDraft((current) => ({ ...current, title }));
            setDirty(true);
          }}
          aria-label="Título de los apuntes"
        />
        {titleOverLimit && (
          <span className="shrink-0 text-danger-ink text-xs">
            {draft.title.length} / {LIMITS.maxNoteTitleCharacters}
          </span>
        )}
        <span className="shrink-0 text-muted text-xs">
          {dirty
            ? overLimitCount > 0
              ? `${overLimitCount} bloque${overLimitCount === 1 ? "" : "s"} pasa${overLimitCount === 1 ? "" : "n"} del máximo de caracteres.`
              : "Cambios sin guardar."
            : "Todo guardado."}
        </span>
        <ActionButton
          icon="save"
          variant="primary"
          size="compact"
          disabled={!canSave}
          onClick={onSave}
        >
          {isSaving ? "Guardando…" : "Guardar apuntes"}
        </ActionButton>
        <ActionButton
          icon="trash"
          variant="danger"
          size="compact"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? "Borrando…" : "Borrar apunte"}
        </ActionButton>
      </header>

      {artifact.proposals.length > 0 && (
        <details className="group mb-4 shrink-0 border border-border bg-surface/50" onToggle={onProposalsToggle}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold text-heading text-sm marker:content-none">
            {artifact.proposals.length === 1 ? "1 propuesta del tutor" : `${artifact.proposals.length} propuestas del tutor`}
            <Icon name="chevron-down" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-border border-t px-4 py-4">
            <p className="text-muted text-xs">Tú decides cuáles se aplican.</p>
            {artifact.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                artifactId={artifact.id}
                proposal={proposal}
                blocks={artifact.blocks}
                blocked={dirty}
              />
            ))}
          </div>
        </details>
      )}

      {noteTargetNotice !== null && (
        <div className="mb-4 shrink-0">
          <StatusNotice tone="info" title={noteTargetNotice} />
        </div>
      )}

      {draft.blocks.length === 0
        ? (
            <div className="grid place-items-center border border-dashed border-border bg-surface/40 p-10 text-center">
              <div>
                <h3 className="font-bold text-heading text-xl">Estos apuntes no tienen bloques todavía.</h3>
                <p className="mt-2 text-muted">Añade el primero para empezar a escribir.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                  <ActionButton
                    icon="plus"
                    variant="primary"
                    onClick={addBlock}
                  >
                    Añadir bloque
                  </ActionButton>
                  <ActionButton
                    icon="link"
                    variant="neutral"
                    onClick={() => setUrlDialogOpen(true)}
                  >
                    Añadir desde una URL
                  </ActionButton>
                </div>
              </div>
            </div>
          )
        : (
            <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
              <NoteOutline
                blocks={draft.blocks}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                onAdd={addBlock}
                onAddFromUrl={() => setUrlDialogOpen(true)}
                onDelete={deleteBlock}
                collapsed={outlineCollapsed}
                onToggleCollapsed={() => setOutlineCollapsed((current) => !current)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {selectedBlock !== undefined && (
                  <SelectedNoteBlock
                    block={selectedBlock}
                    artifactId={artifact.id}
                    position={{
                      index: draft.blocks.findIndex((candidate) => candidate.key === selectedBlock.key) + 1,
                      total: draft.blocks.length
                    }}
                    onChangeMarkdown={(markdown) => patchBlock(selectedBlock.key, { markdown })}
                    onToggleEmphasis={() => patchBlock(selectedBlock.key, { emphasis: !selectedBlock.emphasis })}
                    onOpenCitation={onOpenCitation}
                  />
                )}
              </div>
            </div>
          )}

      <Dialog open={urlDialogOpen} onClose={() => setUrlDialogOpen(false)} title="Añadir un bloque desde una URL" widthClassName="max-w-lg">
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-heading text-lg">Añadir un bloque desde una URL</h2>
            <IconButton icon="close" label="Cerrar" onClick={() => setUrlDialogOpen(false)} />
          </div>
          <AddFromUrl
            onAdd={(result) => {
              addBlockFromUrl(result);
              setUrlDialogOpen(false);
            }}
            onCancel={() => setUrlDialogOpen(false)}
          />
        </div>
      </Dialog>

      {error !== undefined && (
        <p className="mt-4 shrink-0 border border-danger/40 bg-danger/15 p-4 text-danger-ink">{error}</p>
      )}
      {tooManyBlocks && (
        <p className="mt-4 shrink-0 border border-danger/40 bg-danger/15 p-4 text-danger-ink">
          Estos apuntes tienen {draft.blocks.length} bloques; el máximo es {LIMITS.maxBlocksPerNote}.
        </p>
      )}
    </article>
  );
}
