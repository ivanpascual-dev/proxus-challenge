import { LIMITS } from "@proxus/shared";
import { useState } from "react";
import { Streamdown } from "streamdown";
import type { DraftBlock } from "./draft.ts";

interface NoteBlockCardProps {
  readonly block: DraftBlock;
  readonly index: number;
  readonly total: number;
  readonly onChangeMarkdown: (markdown: string) => void;
  readonly onToggleEmphasis: () => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onDelete: () => void;
}

const authorLabel = (author: DraftBlock["author"]) => (author === "tutor" ? "Tutor" : "Tú");

export function NoteBlockCard({
  block,
  index,
  total,
  onChangeMarkdown,
  onToggleEmphasis,
  onMove,
  onDelete
}: NoteBlockCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const overLimit = block.markdown.length > LIMITS.maxBlockCharacters;

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
          {block.source !== null && <span>· con fuente</span>}
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
            className="rounded-lg border border-border px-2 py-1 text-sm hover:border-brand"
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? "Hecho" : "Editar"}
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

      {isEditing
        ? (
            <div className="grid gap-1">
              <textarea
                className="min-h-32 w-full rounded-2xl border border-border-strong bg-canvas p-3 text-heading outline-none focus:border-brand"
                value={block.markdown}
                onChange={(event) => onChangeMarkdown(event.currentTarget.value)}
                placeholder="Escribe el bloque en markdown…"
              />
              <span className={`self-end text-xs ${overLimit ? "text-danger-ink" : "text-muted"}`}>
                {overLimit
                  ? `${block.markdown.length} / ${LIMITS.maxBlockCharacters} caracteres: pasa del máximo`
                  : `${block.markdown.length} / ${LIMITS.maxBlockCharacters}`}
              </span>
            </div>
          )
        : block.markdown.trim().length === 0
          ? <p className="text-muted italic">Bloque vacío. Pulsa Editar para escribirlo.</p>
          : (
              <div className="prose dark:prose-invert max-w-none">
                <Streamdown>{block.markdown}</Streamdown>
              </div>
            )}
    </section>
  );
}
