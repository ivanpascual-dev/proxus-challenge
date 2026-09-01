import type { ChatContextRef } from "@proxus/shared";
import { Icon } from "../ui/Icon.tsx";

// Invariante 9 llevada a la interfaz (fase 4, decisión 5, enmienda ADR-006; fase 5, §4.4: "ContextBar
// aparece encima del composer"). Lo que el tutor va a recibir sin que el alumno lo haya escrito se ve
// aquí, antes de enviar, y se puede quitar con la ×. Adjuntar nunca envía por sí mismo.
export function contextRefKey(ref: ChatContextRef): string {
  switch (ref.type) {
    case "material":
      return `material:${ref.materialId}`;
    case "artifact":
      return `artifact:${ref.artifactId}`;
    case "block":
      return `block:${ref.artifactId}:${ref.blockId}`;
  }
}

function contextRefLabel(ref: ChatContextRef): string {
  switch (ref.type) {
    case "material":
      return `Material: ${ref.title}`;
    case "artifact":
      return `Apunte/prueba: ${ref.title}`;
    case "block":
      return `Bloque: ${ref.title}`;
  }
}

export function ContextBar({
  refs,
  onRemove
}: {
  readonly refs: readonly ChatContextRef[];
  readonly onRemove: (ref: ChatContextRef) => void;
}) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-border border-t px-4 pt-3" aria-label="Contexto que ve Sym">
      <span className="text-muted text-xs">Sym ve:</span>
      {refs.map((ref) => (
        <span
          key={contextRefKey(ref)}
          className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3 py-1 text-heading text-xs"
        >
          {contextRefLabel(ref)}
          <button
            type="button"
            onClick={() => onRemove(ref)}
            aria-label={`Quitar ${contextRefLabel(ref)} del contexto`}
            className="text-muted hover:text-danger-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </span>
      ))}
    </div>
  );
}
