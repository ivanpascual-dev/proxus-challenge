import { useAtomSet } from "@effect/atom-react";
import { LIMITS, type RewriteMode } from "@proxus/shared";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { rewriteBlockAction } from "../../domain/artifacts/atoms.ts";
import { BlockEditor } from "./BlockEditor.tsx";
import type { DraftBlock } from "./draft.ts";
import { describeFailure } from "../../lib/user-feedback.ts";
import { MaterialCitation } from "../ui/MaterialCitation.tsx";
import { blockHeading } from "./NoteOutline.tsx";
import { ActionButton } from "../ui/ActionButton.tsx";

interface SelectedNoteBlockProps {
  readonly block: DraftBlock;
  readonly artifactId: string;
  readonly position: { readonly index: number; readonly total: number };
  readonly onChangeMarkdown: (markdown: string) => void;
  readonly onToggleEmphasis: () => void;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}

const pageRangeLabel = (pages: readonly number[]): string => {
  if (pages.length === 0) {
    return "";
  }
  const min = Math.min(...pages);
  const max = Math.max(...pages);
  return min === max ? `página ${min}` : `páginas ${min}-${max}`;
};

const authorLabel = (author: DraftBlock["author"]) => (author === "tutor" ? "Tutor" : "Tú");

const modeLabel: Record<RewriteMode, string> = {
  clearer: "Más claro",
  deeper: "Más a fondo"
};

// Un único bloque a la vez (fase 5, §4.8): el índice de la izquierda ya no repite este contenido, y
// el reordenar vive en `NoteOutline`, no aquí.
export function SelectedNoteBlock({
  block,
  artifactId,
  position,
  onChangeMarkdown,
  onToggleEmphasis,
  onOpenCitation
}: SelectedNoteBlockProps) {
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
      const notice = describeFailure(cause, { area: "notes", action: "generate" }, "SelectedNoteBlock");
      setRewriteError(notice.description ?? notice.title);
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
    <section className={`border-l-2 pl-4 ${block.emphasis ? "border-brand" : "border-transparent"}`}>
      <p className="text-muted text-xs">
        Bloque {position.index} de {position.total} · {blockHeading(block.markdown)}
        {block.source?.type === "material" && block.source.pages.length > 0 && (
          <> · generado desde las {pageRangeLabel(block.source.pages)}</>
        )}
      </p>

      <div className="mt-2 mb-3 flex flex-wrap items-center justify-between gap-2 border-border border-b pb-3">
        <div className="flex items-center gap-2 text-muted text-sm">
          <span>{authorLabel(block.author)}</span>
          {block.source?.type === "material" && <span>· cita un material</span>}
          {block.source?.type === "url" && <span>· cita una URL</span>}
        </div>
        <ActionButton
          icon="star"
          variant={block.emphasis ? "selected" : "neutral"}
          size="compact"
          onClick={onToggleEmphasis}
          aria-pressed={block.emphasis}
        >
          Importante
        </ActionButton>
      </div>

      <div className="grid gap-1">
        <BlockEditor markdown={block.markdown} onChange={onChangeMarkdown} />
        <span className={`self-end text-xs ${overLimit ? "text-danger-ink" : "text-muted"}`}>
          {overLimit
            ? `${block.markdown.length} / ${LIMITS.maxBlockCharacters} caracteres: pasa del máximo`
            : `${block.markdown.length} / ${LIMITS.maxBlockCharacters}`}
        </span>
      </div>

      {block.source?.type === "material" && (
        <div className="mt-3 border-border border-t pt-3">
          <MaterialCitation
            materialId={block.source.materialId}
            pages={block.source.pages}
            transcribed={block.source.transcribed}
            {...(block.source.unanchoredReason !== null ? { unanchoredReason: block.source.unanchoredReason } : {})}
            onOpen={onOpenCitation}
          />
        </div>
      )}
      {block.source?.type === "url" && (
        <aside className="mt-3 border border-border bg-canvas/60 p-3 text-sm">
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
            <ActionButton
              key={mode}
              icon="edit"
              variant="brand"
              size="compact"
              disabled={!canRewrite || rewriting !== null}
              onClick={() => askRewrite(mode)}
            >
              {rewriting === mode ? "Reescribiendo…" : modeLabel[mode]}
            </ActionButton>
          ))}
          {block.id === undefined && (
            <span className="text-muted text-xs italic">guarda el apunte primero</span>
          )}
        </div>

        {rewriteError !== undefined && (
          <p className="mt-2 border border-danger/40 bg-danger/15 p-2 text-danger-ink text-xs">
            {rewriteError}
          </p>
        )}

        {proposal !== null && (
          <div className="mt-3 grid gap-2 border border-brand/50 bg-brand/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-brand text-xs uppercase tracking-widest">Propuesta del tutor</p>
              {!proposal.usedSource && (
                <span className=" bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink">
                  reescrito sin fuente
                </span>
              )}
            </div>
            <div className="prose dark:prose-invert max-w-none bg-canvas/60 p-3 text-sm">
              <Streamdown>{proposal.markdown}</Streamdown>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                icon="check"
                variant="primary"
                size="compact"
                onClick={acceptProposal}
              >
                Reemplazar el bloque
              </ActionButton>
              <ActionButton
                icon="trash"
                variant="danger"
                size="compact"
                onClick={() => setProposal(null)}
              >
                Descartar
              </ActionButton>
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
