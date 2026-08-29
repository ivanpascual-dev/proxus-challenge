import { useAtomSet } from "@effect/atom-react";
import { LIMITS, type RewriteMode } from "@proxus/shared";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { rewriteBlockAction } from "../../domain/artifacts/atoms.ts";
import { BlockCitation } from "./BlockCitation.tsx";
import { BlockEditor } from "./BlockEditor.tsx";
import type { DraftBlock } from "./draft.ts";

interface NoteBlockCardProps {
  readonly block: DraftBlock;
  readonly index: number;
  readonly total: number;
  readonly artifactId: string;
  readonly onChangeMarkdown: (markdown: string) => void;
  readonly onToggleEmphasis: () => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onDelete: () => void;
}

const authorLabel = (author: DraftBlock["author"]) => (author === "tutor" ? "Tutor" : "Tú");

const modeLabel: Record<RewriteMode, string> = {
  clearer: "Más claro",
  deeper: "Más a fondo"
};

export function NoteBlockCard({
  block,
  index,
  total,
  artifactId,
  onChangeMarkdown,
  onToggleEmphasis,
  onMove,
  onDelete
}: NoteBlockCardProps) {
  const overLimit = block.markdown.length > LIMITS.maxBlockCharacters;

  const rewrite = useAtomSet(rewriteBlockAction, { mode: "promise" });
  const [rewriting, setRewriting] = useState<RewriteMode | null>(null);
  const [proposal, setProposal] = useState<{ readonly markdown: string; readonly usedSource: boolean } | null>(null);
  const [rewriteError, setRewriteError] = useState<string | undefined>();

  // La reescritura trabaja sobre el texto guardado del bloque (F2-17: solo el bloque y su fragmento).
  // Un bloque sin `id` todavía no está en el servidor, así que no se puede reescribir hasta guardar.
  const canRewrite = block.id !== undefined && block.markdown.trim().length > 0;

  const askRewrite = async (mode: RewriteMode) => {
    if (block.id === undefined) {
      return;
    }
    setRewriting(mode);
    setProposal(null);
    setRewriteError(undefined);
    try {
      const result = await rewrite({ id: artifactId, blockId: block.id, mode });
      setProposal(result);
    } catch (cause) {
      setRewriteError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRewriting(null);
    }
  };

  const acceptProposal = () => {
    if (proposal === null) {
      return;
    }
    onChangeMarkdown(proposal.markdown);
    setProposal(null);
  };

  return (
    <section
      className={`rounded-3xl border bg-surface p-5 ${
        block.emphasis ? "border-brand" : "border-border"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted text-sm">
          <span className="rounded-full bg-canvas px-2 py-0.5">{authorLabel(block.author)}</span>
          {block.emphasis && <span className="text-brand">★ Importante</span>}
          {block.source?.type === "material" && <span>· cita un material</span>}
          {block.source?.type === "url" && <span>· cita una URL</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-sm hover:border-brand disabled:opacity-40"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Subir el bloque"
          >
            ↑
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-sm hover:border-brand disabled:opacity-40"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Bajar el bloque"
          >
            ↓
          </button>
          <button
            type="button"
            className={`rounded-lg border px-2 py-1 text-sm hover:border-brand ${
              block.emphasis ? "border-brand text-brand" : "border-border"
            }`}
            onClick={onToggleEmphasis}
            aria-pressed={block.emphasis}
          >
            ★
          </button>
          <button
            type="button"
            className="rounded-lg border border-danger/40 px-2 py-1 text-danger-ink text-sm hover:border-danger"
            onClick={onDelete}
          >
            Borrar
          </button>
        </div>
      </div>

      <div className="grid gap-1">
        <BlockEditor markdown={block.markdown} onChange={onChangeMarkdown} />
        <span className={`self-end text-xs ${overLimit ? "text-danger-ink" : "text-muted"}`}>
          {overLimit
            ? `${block.markdown.length} / ${LIMITS.maxBlockCharacters} caracteres: pasa del máximo`
            : `${block.markdown.length} / ${LIMITS.maxBlockCharacters}`}
        </span>
      </div>

      {block.source?.type === "material" && <BlockCitation source={block.source} />}
      {block.source?.type === "url" && (
        <aside className="mt-3 rounded-2xl border border-border bg-canvas/60 p-3 text-sm">
          <p className="font-semibold text-body">
            <a href={block.source.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {block.source.title || block.source.url}
            </a>
          </p>
          <p className="mt-1 text-muted text-xs">Traído el {new Date(block.source.fetchedAt).toLocaleString("es")}</p>
        </aside>
      )}

      <div className="mt-3 border-border/60 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted text-xs">Reescribir con el tutor:</span>
          {(["clearer", "deeper"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="rounded-lg border border-border px-2 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-40"
              disabled={!canRewrite || rewriting !== null}
              onClick={() => askRewrite(mode)}
            >
              {rewriting === mode ? "Reescribiendo…" : modeLabel[mode]}
            </button>
          ))}
          {block.id === undefined && (
            <span className="text-muted text-xs italic">guarda el apunte primero</span>
          )}
        </div>

        {rewriteError !== undefined && (
          <p className="mt-2 rounded-xl border border-danger/40 bg-danger/15 p-2 text-danger-ink text-xs">
            {rewriteError}
          </p>
        )}

        {proposal !== null && (
          <div className="mt-3 grid gap-2 rounded-2xl border border-brand/50 bg-brand/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-brand text-xs uppercase tracking-widest">Propuesta del tutor</p>
              {!proposal.usedSource && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink">
                  reescrito sin fuente
                </span>
              )}
            </div>
            <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm">
              <Streamdown>{proposal.markdown}</Streamdown>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-brand px-4 py-1.5 font-semibold text-on-brand text-sm hover:bg-brand/90"
                onClick={acceptProposal}
              >
                Reemplazar el bloque
              </button>
              <button
                type="button"
                className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-brand"
                onClick={() => setProposal(null)}
              >
                Descartar
              </button>
            </div>
            <p className="text-muted text-xs">
              Reemplazar solo cambia el borrador: los apuntes no se guardan hasta que pulses «Guardar apuntes».
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
