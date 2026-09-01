import { Icon } from "./Icon.tsx";

// Procedencia visual común a apuntes, pruebas y chat (fase 5, decisión 26, §4.10): reemplaza
// progresivamente `BlockCitation` y `QuestionSourceLine`. Siempre abre el material correcto, cambia a
// PDF y navega a la primera página citada; eso lo decide quien recibe `onOpen`, no este componente.
// Una cita sin páginas o sin ancla nunca navega y enseña el motivo en su lugar.

interface MaterialCitationProps {
  readonly materialId: string;
  readonly pages: readonly number[];
  readonly transcribed?: boolean;
  readonly unanchoredReason?: string;
  readonly label?: string;
  readonly onOpen: (materialId: string, page: number) => void;
}

export function MaterialCitation({ materialId, pages, transcribed = false, unanchoredReason, label, onOpen }: MaterialCitationProps) {
  const isAnchored = unanchoredReason === undefined && pages.length > 0;
  const pagesLabel = pages.length === 0
    ? ""
    : pages.length === 1
      ? `página ${pages[0]}`
      : `páginas ${pages.join(", ")}`;
  const text = label ?? (pagesLabel.length > 0 ? pagesLabel : "fuente");

  if (!isAnchored) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted text-xs italic">
        {unanchoredReason ?? "Esta cita no tiene una página a la que ir."}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpen(materialId, pages[0]!)}
        className="inline-flex items-center gap-1 rounded-full border border-border-strong/60 px-2 py-0.5 text-brand text-xs hover:border-brand hover:bg-brand-soft"
      >
        <Icon name="chevron-right" size={16} />
        {text}
      </button>
      {transcribed && (
        <span className="text-[0.7rem] text-muted">transcrito por el modelo</span>
      )}
    </span>
  );
}
