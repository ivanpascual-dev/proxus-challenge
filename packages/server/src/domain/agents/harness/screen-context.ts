import type { MaterialSurface } from "@proxus/shared";

// Texto canónico literal, fase 4, sección 6.2: se añade al final del mensaje del usuario, nunca al
// system prompt (decisión 11), porque cambia en cada turno y ahí rompería la caché de todo lo demás.
// Lo que entra aquí ya está resuelto contra datos reales (fase 5, §5.2): quien construye estas
// referencias comprobó que el material, la página, la prueba o el bloque existen. Nunca lleva texto
// libre del material: si no se puede pegar contenido, no se puede colar contenido.

// El vocabulario visible de las cuatro pestañas (§6.3). Sym las conoce por su nombre en la interfaz,
// así que la superficie se traduce a ese nombre y no al identificador interno.
const SURFACE_LABEL: Record<MaterialSurface, string> = {
  pdf: "PDF",
  mindmap: "Mapa",
  notes: "Apuntes",
  assessments: "Pruebas"
};

// Qué es la prueba abierta, derivado del artefacto real y no de su título (§5.2): un Control es
// siempre práctica; un Examen es "de prueba" o "real" según su `mode`.
export type AssessmentLabel = "Control" | "Examen de prueba" | "Examen real";

// Una referencia de pantalla ya comprobada contra el repositorio. `ResolvedScreenRef` existe para que
// este render sea puro y testeable: aquí no se lee disco ni se decide si algo existe.
export type ResolvedScreenRef =
  | {
      readonly kind: "material";
      readonly materialId: string;
      readonly title: string;
      // Ausente en un turno guardado antes de fase 5: entonces no se afirma pestaña ninguna.
      readonly surface: MaterialSurface | undefined;
    }
  | { readonly kind: "note"; readonly artifactId: string; readonly title: string }
  | {
      readonly kind: "assessment";
      readonly artifactId: string;
      readonly title: string;
      readonly assessment: AssessmentLabel;
      readonly view: "solve" | "history";
    }
  | {
      readonly kind: "block";
      readonly artifactId: string;
      readonly blockId: string;
      readonly title: string;
    }
  | {
      readonly kind: "page";
      readonly materialId: string;
      readonly materialTitle: string;
      readonly page: number;
    };

const describeRef = (ref: ResolvedScreenRef): string => {
  switch (ref.kind) {
    case "material":
      return ref.surface === undefined
        ? `material "${ref.title}" (id: ${ref.materialId})`
        : `material "${ref.title}" (id: ${ref.materialId}), on the "${SURFACE_LABEL[ref.surface]}" tab`;
    case "note":
      return `note "${ref.title}" (id: ${ref.artifactId})`;
    case "assessment":
      return ref.view === "solve"
        ? `${ref.assessment} "${ref.title}" (id: ${ref.artifactId}), open in its solver`
        : `${ref.assessment} "${ref.title}" (id: ${ref.artifactId}), open in its attempt history`;
    case "block":
      return `block "${ref.title}" (id: ${ref.blockId}, in note ${ref.artifactId})`;
    case "page":
      return `page ${ref.page} of material "${ref.materialTitle}" (id: ${ref.materialId})`;
  }
};

export const renderScreenContext = (refs: readonly ResolvedScreenRef[]): string | undefined => {
  if (refs.length === 0) {
    return undefined;
  }

  return [
    "<<<BEGIN SCREEN CONTEXT>>>",
    `The student is currently looking at: ${refs.map(describeRef).join(", ")}`,
    "These are pointers, not content. Read anything you need with a command.",
    "<<<END SCREEN CONTEXT>>>"
  ].join("\n");
};
