import type { ChatContextRef } from "@proxus/shared";

// Invariante 9 llevada a la interfaz (fase 4, decisión 5, enmienda ADR-006): lo que el tutor va a
// recibir sin que el alumno lo haya escrito se ve aquí, antes de enviar, y se puede quitar con la ×.
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

export function ChatContextBar({
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
    <div className="flex flex-wrap items-center gap-2 border-border border-b px-6 py-3" aria-label="Contexto que ve el tutor">
      <span className="text-muted text-xs">El tutor ve:</span>
      {refs.map((ref) => (
        <span
          key={contextRefKey(ref)}
          className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3 py-1 text-heading text-xs"
        >
          {contextRefLabel(ref)}
          <button
            type="button"
            className="text-muted hover:text-danger-ink"
            aria-label={`Quitar ${contextRefLabel(ref)} del contexto`}
            onClick={() => onRemove(ref)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
