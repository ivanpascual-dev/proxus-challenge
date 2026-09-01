import type { ChatContextRef } from "@proxus/shared";

// Texto canónico literal, fase 4, sección 6.2: se añade al final del mensaje del usuario, nunca al
// system prompt (decisión 11), porque cambia en cada turno y ahí rompería la caché de todo lo demás.
// `ChatContextRef` solo lleva identificadores y título (decisión 5): si no se puede pegar contenido,
// no se puede colar contenido, así que este bloque nunca contiene texto libre del material.
const describeRef = (ref: ChatContextRef): string => {
  switch (ref.type) {
    case "material":
      return `material "${ref.title}" (id: ${ref.materialId})`;
    case "artifact":
      return `artifact "${ref.title}" (id: ${ref.artifactId})`;
    case "block":
      return `block "${ref.title}" (id: ${ref.blockId}, in artifact ${ref.artifactId})`;
  }
};

export const renderScreenContext = (refs: readonly ChatContextRef[]): string | undefined => {
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
