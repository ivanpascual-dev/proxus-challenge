import type { ChatContextRef } from "@proxus/shared";
import { Icon } from "../ui/Icon.tsx";

// Invariante 9 llevada a la interfaz (fase 4, decisión 5, enmienda ADR-006; fase 5, §4.4: "ContextBar
// aparece encima del composer"). Lo que el tutor va a recibir sin que el alumno lo haya escrito se ve
// aquí, antes de enviar, y se puede quitar con la ×. Adjuntar nunca envía por sí mismo.
export function contextRefKey(ref: ChatContextRef): string {
  switch (ref.type) {
    case "material":
      // La superficie no entra en la clave: cambiar de pestaña no es adjuntar otro material, así que
      // un chip de material retirado sigue retirado al moverse por el material.
      return `material:${ref.materialId}`;
    case "artifact":
      return `artifact:${ref.artifactId}`;
    case "assessment":
      return `assessment:${ref.artifactId}`;
    case "block":
      return `block:${ref.artifactId}:${ref.blockId}`;
    case "page":
      return `page:${ref.materialId}:${ref.page}`;
  }
}

// Fase 5, §5.2: el chip dice en qué zona está el alumno con el mismo vocabulario que ve en la
// interfaz. La prueba no dice si es Control o Examen: eso lo deriva el servidor del artefacto real,
// y el chip solo tiene que ser reconocible para quien lo va a retirar.
const SURFACE_LABEL: Record<NonNullable<Extract<ChatContextRef, { readonly type: "material" }>["surface"]>, string> = {
  pdf: "PDF",
  mindmap: "Mapa",
  notes: "Apuntes",
  assessments: "Pruebas"
};

function contextRefLabel(ref: ChatContextRef): string {
  switch (ref.type) {
    case "material":
      return ref.surface === undefined
        ? `Material: ${ref.title}`
        : `Material: ${ref.title} · ${SURFACE_LABEL[ref.surface]}`;
    case "artifact":
      return `Apunte: ${ref.title}`;
    case "assessment":
      return ref.view === "solve"
        ? `Prueba: ${ref.title}`
        : `Prueba: ${ref.title} · historial`;
    case "block":
      return `Bloque: ${ref.title}`;
    case "page":
      return `Página ${ref.page}: ${ref.title}`;
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5 border-border border-t px-4 py-3" aria-label="Contexto que ve Sym">
      <span className="text-muted text-xs">Sym ve:</span>
      {refs.map((ref) => (
        <span
          key={contextRefKey(ref)}
          className="flex items-center gap-1.5 rounded-sm border border-brand/40 bg-brand-soft px-3 py-1 text-heading text-xs"
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
