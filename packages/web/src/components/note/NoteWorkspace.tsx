import { useAtomSet } from "@effect/atom-react";
import { LIMITS, type Artifact, type UrlSourceResult } from "@proxus/shared";
import { useEffect, useMemo, useState } from "react";
import { saveNoteAction } from "../../domain/artifacts/atoms.ts";
import { AddFromUrl } from "./AddFromUrl.tsx";
import { NoteBlockCard } from "./NoteBlockCard.tsx";
import { ProposalCard } from "./ProposalCard.tsx";
import {
  draftFromArtifact,
  draftToSaveInput,
  nextKey,
  type DraftBlock,
  type NoteDraft
} from "./draft.ts";
import { describeFailure } from "../../lib/user-feedback.ts";

type NoteArtifact = Extract<Artifact, { readonly kind: "note" }>;

interface NoteWorkspaceProps {
  readonly artifact: NoteArtifact;
}

const move = <T,>(items: readonly T[], from: number, to: number): readonly T[] => {
  if (to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked as T);
  return next;
};

export function NoteWorkspace({ artifact }: NoteWorkspaceProps) {
  const [draft, setDraft] = useState<NoteDraft>(() => draftFromArtifact(artifact));
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const save = useAtomSet(saveNoteAction, { mode: "promise" });

  // Cuando el artefacto cambia por debajo (aceptar o descartar una propuesta refresca el apunte) y
  // no hay cambios sin guardar, se recarga el borrador para reflejar el bloque nuevo. Con cambios
  // sin guardar no se toca: aceptar una propuesta está bloqueado en ese caso.
  useEffect(() => {
    if (!dirty) {
      setDraft(draftFromArtifact(artifact));
    }
  }, [artifact, dirty]);

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

  const addBlock = () => {
    const block: DraftBlock = {
      key: nextKey(),
      id: undefined,
      markdown: "",
      author: "student",
      emphasis: false,
      source: null
    };
    update([...draft.blocks, block]);
  };

  const addBlockFromUrl = ({ source, draft: body }: UrlSourceResult) => {
    const block: DraftBlock = {
      key: nextKey(),
      id: undefined,
      markdown: body ?? "",
      // Si el modelo redactó el borrador, la autoría es del tutor; si no, el bloque nace vacío y es tuyo.
      author: body !== null ? "tutor" : "student",
      emphasis: false,
      source
    };
    update([...draft.blocks, block]);
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

  return (
    <article className="mx-auto max-w-4xl">
      <header className="mb-5 rounded-3xl border border-border bg-surface p-6">
        <p className="mb-2 font-bold text-brand text-xs uppercase tracking-widest">Apuntes</p>
        <input
          className="w-full rounded-2xl border border-border-strong bg-canvas p-2 font-bold text-2xl text-heading outline-none focus:border-brand"
          value={draft.title}
          onChange={(event) => {
            // Se lee ya, no dentro del updater: React anula `currentTarget` al retornar el handler.
            const title = event.currentTarget.value;
            setDraft((current) => ({ ...current, title }));
            setDirty(true);
          }}
          aria-label="Título de los apuntes"
        />
        <p className={`mt-1 text-xs ${titleOverLimit ? "text-danger-ink" : "text-muted"}`}>
          {draft.title.length} / {LIMITS.maxNoteTitleCharacters}
        </p>
      </header>

      {artifact.proposals.length > 0 && (
        <div className="mb-5 grid gap-3">
          <p className="text-muted text-xs">
            {artifact.proposals.length === 1
              ? "El tutor ha propuesto un cambio. Tú decides si se aplica."
              : `El tutor ha propuesto ${artifact.proposals.length} cambios. Tú decides cuáles se aplican.`}
          </p>
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
      )}

      {draft.blocks.length === 0
        ? (
            <div className="grid gap-4">
              <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-surface/40 p-10 text-center">
                <div>
                  <h3 className="font-bold text-heading text-xl">Estos apuntes no tienen bloques todavía.</h3>
                  <p className="mt-2 text-muted">Añade el primero para empezar a escribir.</p>
                  <button
                    type="button"
                    className="mt-4 rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90"
                    onClick={addBlock}
                  >
                    Añadir bloque
                  </button>
                </div>
              </div>
              <AddFromUrl onAdd={addBlockFromUrl} />
            </div>
          )
        : (
            <div className="grid gap-4">
              {draft.blocks.map((block, index) => (
                <NoteBlockCard
                  key={block.key}
                  block={block}
                  index={index}
                  total={draft.blocks.length}
                  artifactId={artifact.id}
                  onChangeMarkdown={(markdown) => patchBlock(block.key, { markdown })}
                  onToggleEmphasis={() => patchBlock(block.key, { emphasis: !block.emphasis })}
                  onMove={(direction) => update(move(draft.blocks, index, index + direction))}
                  onDelete={() => update(draft.blocks.filter((candidate) => candidate.key !== block.key))}
                />
              ))}
              <button
                type="button"
                className="rounded-3xl border border-dashed border-border p-4 text-muted hover:border-brand hover:text-brand"
                onClick={addBlock}
              >
                + Añadir bloque
              </button>
              <AddFromUrl onAdd={addBlockFromUrl} />
            </div>
          )}

      {error !== undefined && (
        <p className="mt-4 rounded-2xl border border-danger/40 bg-danger/15 p-4 text-danger-ink">{error}</p>
      )}
      {tooManyBlocks && (
        <p className="mt-4 rounded-2xl border border-danger/40 bg-danger/15 p-4 text-danger-ink">
          Estos apuntes tienen {draft.blocks.length} bloques; el máximo es {LIMITS.maxBlocksPerNote}.
        </p>
      )}

      <footer className="sticky bottom-0 mt-6 rounded-3xl border border-border bg-canvas/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted text-sm">
            {dirty
              ? overLimitCount > 0
                ? `${overLimitCount} bloque${overLimitCount === 1 ? "" : "s"} pasa${overLimitCount === 1 ? "" : "n"} del máximo de caracteres.`
                : "Cambios sin guardar."
              : "Todo guardado."}
          </p>
          <button
            type="button"
            className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={onSave}
          >
            {isSaving ? "Guardando…" : "Guardar apuntes"}
          </button>
        </div>
      </footer>
    </article>
  );
}
