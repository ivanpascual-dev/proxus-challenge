import type { AgentMessage } from "@proxus/shared";

type ResourceKey = "artifacts" | "materials";

export interface InvalidationHandlers {
  // Invalida la etiqueta `artifacts`, no solo recarga la lista: el tutor puede haber tocado el apunte
  // abierto (`artifactQuery(id)`), no solo el listado.
  readonly invalidateArtifacts: () => void;
  readonly refreshMaterials: () => void;
}

export const invalidationsForToolCall = (message: AgentMessage): readonly ResourceKey[] => {
  if (message.role !== "tool-call" || message.name !== "cli") {
    return [];
  }

  const input = cliInput(message.input);
  if (input === undefined) {
    return [];
  }

  if (isArtifactMutation(input)) {
    return ["artifacts"];
  }

  if (isMaterialMutation(input)) {
    return ["materials"];
  }

  return [];
};

export const applyInvalidations = (
  keys: readonly ResourceKey[],
  handlers: InvalidationHandlers
) => {
  if (keys.includes("artifacts")) {
    handlers.invalidateArtifacts();
  }

  if (keys.includes("materials")) {
    handlers.refreshMaterials();
  }
};

const cliInput = (input: unknown) => {
  if (typeof input !== "object" || input === null || !("input" in input)) {
    return undefined;
  }

  const command = input.input;
  return typeof command === "string" ? command.trim() : undefined;
};

// El tutor solo tiene una mutación de artefacto: proponer un cambio en un apunte (`artifacts note
// propose`). No crea pruebas ni entrega intentos (fase 3, decisiones 4 y 7).
const isArtifactMutation = (input: string) =>
  input.startsWith("artifacts note ");

const isMaterialMutation = (input: string) =>
  input.startsWith("materials import ") ||
  input.startsWith("materials delete ") ||
  input.startsWith("materials index ");
