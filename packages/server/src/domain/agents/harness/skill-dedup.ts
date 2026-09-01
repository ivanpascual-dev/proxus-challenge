import type { AgentMessage } from "./message.ts";
import { AgentMessage as AgentMessageOf } from "./message.ts";

// Palanca 3a (fase 4, decisión 12a): el cuerpo de una skill se envía una vez por sesión. Al rearmar
// el historial para el prompt, solo la primera vez que el modelo cargó una skill conserva el cuerpo
// devuelto por `load_skill`; toda repetición se sustituye por el puntero, para que el modelo la
// relea donde ya está en vez de pagar sus bytes otra vez.
export const ALREADY_LOADED_NOTICE = "Already loaded above. Re-read it there.";

const skillNameFromLoadSkillInput = (input: unknown): string | undefined =>
  typeof input === "object" && input !== null && "name" in input && typeof input.name === "string"
    ? input.name
    : undefined;

// Empareja cada `tool-result` de `load_skill` con el `tool-call` que lo pidió por orden de
// aparición (mismo patrón que `session.ts`, que añade primero todos los tool-calls del paso y luego
// todos los tool-results en el mismo orden): nunca se reordena ni se elimina un mensaje, solo se
// sustituye el `result` de las repeticiones.
export const dedupeSkillLoads = (
  messages: readonly AgentMessage[]
): readonly AgentMessage[] => {
  const pendingNames: (string | undefined)[] = [];
  const seen = new Set<string>();

  return messages.map((message) => {
    if (message.role === "tool-call" && message.name === "load_skill") {
      pendingNames.push(skillNameFromLoadSkillInput(message.input));
      return message;
    }

    if (message.role === "tool-result" && message.name === "load_skill") {
      const name = pendingNames.shift();
      if (name === undefined) {
        return message;
      }

      if (seen.has(name)) {
        return AgentMessageOf.toolResult(message.name, ALREADY_LOADED_NOTICE, message.isFailure);
      }

      seen.add(name);
      return message;
    }

    return message;
  });
};
