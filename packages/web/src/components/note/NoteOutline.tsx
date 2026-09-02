import { useMemo, useState } from "react";
import type { DraftBlock } from "./draft.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";

const SEARCH_THRESHOLD = 12;

// Encabezado de un item del índice: la primera línea no vacía del bloque, sin marcas de Markdown, y
// acotada para que quepa en 220px (fase 5, §4.8).
export const blockHeading = (markdown: string): string => {
  const line = markdown
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  if (line === undefined) {
    return "Bloque vacío";
  }
  const clean = line.replace(/^#{1,6}\s*/, "").replace(/[*_`]/g, "").trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : (clean.length === 0 ? "Bloque vacío" : clean);
};

const pageRangeLabel = (block: DraftBlock): string => {
  if (block.source?.type !== "material" || block.source.pages.length === 0) {
    return "";
  }
  const min = Math.min(...block.source.pages);
  const max = Math.max(...block.source.pages);
  return min === max ? `p. ${min}` : `p. ${min}–${max}`;
};

interface NoteOutlineProps {
  readonly blocks: readonly DraftBlock[];
  readonly selectedKey: string | null;
  readonly onSelect: (key: string) => void;
  readonly onAdd: () => void;
  readonly onAddFromUrl: () => void;
  readonly onDelete: (key: string) => void;
  // Plan de correcciones §4.2.8 / C5-14: el estado de contraído lo posee `NoteWorkspace` y no se
  // persiste (vive mientras el workspace del apunte esté montado).
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}

// Columna izquierda de 240px (fase 5, §4.8, decisión 19): todos los bloques, uno se edita a la vez.
// Numerados como en el diseño de referencia, sin flechas de reordenar ni metadatos de autor: borrar
// vive aquí (al pasar el ratón), no en el bloque abierto.
//
// Plan de correcciones §4.2.8 / C5-14 (enmienda posterior a la sesión 4, decisión 15): contraído es un
// rail de 56px que conserva expandir, `Añadir bloque` y `Añadir desde una URL`, y sigue listando los
// bloques numerados y seleccionables, con recuadro para los destacados. Buscar y borrar siguen
// requiriendo expandir. Contraer no cambia por sí mismo la selección; el editor y el borrador no se
// desmontan (lo mantiene `NoteWorkspace`).
export function NoteOutline({ blocks, selectedKey, onSelect, onAdd, onAddFromUrl, onDelete, collapsed, onToggleCollapsed }: NoteOutlineProps) {
  const [search, setSearch] = useState("");
  const showSearch = blocks.length >= SEARCH_THRESHOLD;
  const term = search.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!showSearch || term.length === 0) {
      return blocks;
    }
    return blocks.filter((block) => blockHeading(block.markdown).toLowerCase().includes(term) || block.markdown.toLowerCase().includes(term));
  }, [blocks, showSearch, term]);

  if (collapsed) {
    return (
      <nav aria-label="Bloques del apunte" className="flex w-[56px] shrink-0 flex-col items-center gap-1 overflow-hidden">
        <IconButton icon="chevron-right" label="Expandir el índice de bloques" onClick={onToggleCollapsed} />
        <IconButton icon="link" label="Añadir un bloque desde una URL" onClick={onAddFromUrl} />
        <IconButton icon="plus" label="Añadir bloque" onClick={onAdd} />
        {blocks.length > 0 && <div className="my-1 h-px w-6 shrink-0 bg-border" />}
        <ul className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-0.5">
          {blocks.map((block, index) => {
            const selected = block.key === selectedKey;
            const heading = blockHeading(block.markdown);
            return (
              <li key={block.key}>
                <Tooltip label={block.emphasis ? `${heading} (destacado)` : heading}>
                  <button
                    type="button"
                    onClick={() => onSelect(block.key)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`Bloque ${index + 1}: ${heading}${block.emphasis ? " (destacado)" : ""}`}
                    className={`grid size-8 place-items-center rounded-sm border text-sm tabular-nums transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      selected
                        ? "border-brand bg-brand-soft text-heading"
                        : block.emphasis
                          ? "border-brand/60 text-body hover:bg-surface-muted"
                          : "border-transparent text-muted hover:bg-surface-muted hover:text-heading"
                    }`}
                  >
                    {index + 1}
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Bloques del apunte" className="flex w-[240px] shrink-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <span className="font-semibold text-muted text-xs uppercase tracking-widest">Bloques</span>
        <div className="flex items-center gap-0.5">
          <IconButton icon="chevron-left" label="Contraer el índice de bloques" onClick={onToggleCollapsed} />
          <IconButton icon="link" label="Añadir un bloque desde una URL" onClick={onAddFromUrl} />
          <IconButton icon="plus" label="Añadir bloque" onClick={onAdd} />
        </div>
      </div>
      {showSearch && (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Buscar un bloque…"
          aria-label="Buscar un bloque del apunte"
          className="mb-2 shrink-0 border border-border-strong bg-canvas p-1.5 text-sm outline-none focus:border-brand"
        />
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
        {visible.length === 0 && (
          <li className="p-3 text-center text-muted text-xs">Ningún bloque coincide con la búsqueda.</li>
        )}
        {visible.map((block) => {
          const index = blocks.findIndex((candidate) => candidate.key === block.key);
          const selected = block.key === selectedKey;
          const pages = pageRangeLabel(block);
          return (
            <li key={block.key} className="group relative mb-1">
              <button
                type="button"
                onClick={() => onSelect(block.key)}
                aria-current={selected ? "true" : undefined}
                className={`flex w-full min-w-0 items-start gap-2 rounded-sm py-2.5 pr-8 pl-2.5 text-left transition ${
                  selected
                    ? "bg-brand-soft text-heading"
                    : block.emphasis
                      ? "bg-brand-soft/30 text-body hover:bg-brand-soft/50"
                      : "text-body hover:bg-surface-muted"
                }`}
              >
                <span className="shrink-0 text-muted text-sm">{index + 1}.</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 truncate font-medium text-sm">
                    {block.emphasis && (
                      <span className="shrink-0 text-brand" aria-hidden>★</span>
                    )}
                    <span className="truncate">{blockHeading(block.markdown)}</span>
                  </span>
                  {pages !== "" && <span className="mt-0.5 block text-muted text-xs">{pages}</span>}
                </span>
              </button>
              <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                <IconButton
                  icon="trash"
                  label={`Borrar el bloque "${blockHeading(block.markdown)}"`}
                  size={16}
                  onClick={() => onDelete(block.key)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
