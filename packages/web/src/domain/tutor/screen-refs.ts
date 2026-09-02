import type { ChatContextRef, MaterialSurface } from "@proxus/shared";

// Qué le proponemos a Sym que está viendo el alumno (fase 5, §5.2). Es lógica pura a propósito: la
// regla de qué convive con qué es lo que mantiene el conjunto dentro de `maxContextRefs` sin recortar
// nada en silencio (invariante 11), y aquí se puede probar sin montar el panel entero.
//
// El conjunto máximo es siempre el mismo: material, el apunte o la prueba de la superficie activa, y
// el bloque o la página. Tres. La superficie viaja DENTRO de la referencia de material, así que
// decir en qué pestaña está el alumno no cuesta un hueco.
export interface ScreenRefsInput {
  readonly materialId: string;
  readonly title: string;
  readonly surface: MaterialSurface;
  // El apunte del material, solo cuando se está en "Apuntes": en las demás pestañas existe, pero no
  // es lo que el alumno está mirando.
  readonly note: { readonly id: string; readonly title: string } | undefined;
  // El bloque seleccionado dentro de ese apunte. Un bloque recién añadido y todavía sin guardar no
  // tiene id en el servidor, así que no viaja: el servidor no podría comprobarlo.
  readonly selectedBlock: { readonly id: string; readonly title: string } | undefined;
  // La prueba abierta en "Pruebas", con la vista que se está mirando. En la lista es `undefined`: no
  // hay ninguna prueba concreta abierta y fingir que la hay es justo lo que evita §5.2.
  readonly assessment:
    | { readonly id: string; readonly title: string; readonly view: "solve" | "history" }
    | undefined;
  // La página adjuntada a mano desde el PDF con `Preguntar a Sym` (F5-40).
  readonly page: number | undefined;
}

export const buildScreenContext = (input: ScreenRefsInput): readonly ChatContextRef[] => {
  const refs: ChatContextRef[] = [
    {
      type: "material",
      materialId: input.materialId,
      title: input.title,
      surface: input.surface
    }
  ];

  if (input.surface === "notes" && input.note !== undefined) {
    refs.push({ type: "artifact", artifactId: input.note.id, title: input.note.title });
    if (input.selectedBlock !== undefined) {
      refs.push({
        type: "block",
        artifactId: input.note.id,
        blockId: input.selectedBlock.id,
        title: input.selectedBlock.title
      });
    }
  }

  if (input.surface === "assessments" && input.assessment !== undefined) {
    refs.push({
      type: "assessment",
      artifactId: input.assessment.id,
      title: input.assessment.title,
      view: input.assessment.view
    });
  }

  if (input.surface === "pdf" && input.page !== undefined) {
    refs.push({
      type: "page",
      materialId: input.materialId,
      page: input.page,
      title: input.title
    });
  }

  // Sin recorte: las reglas de arriba ya dejan tres como máximo, y si alguna vez dejaran de hacerlo,
  // el servidor lo rechazaría en voz alta (`maxContextRefs`) en vez de mandar un contexto podado a
  // escondidas (invariante 11). El test de este fichero es el que vigila el techo.
  return refs;
};
