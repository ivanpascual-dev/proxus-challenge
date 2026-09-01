import { LIMITS } from "@proxus/shared";
import { redactForLog } from "./user-feedback.ts";

// Fase 5, §4.4 y §5.4: el segundo nivel de `AgentActivity` puede enseñar herramienta, input y
// resultado, pero nunca claves, tokens, system prompt, base64 ni un resultado desproporcionado. El
// dato persistido (`AgentMessage.result`) no se toca: esto solo decide qué se pinta.
export interface FormattedActivityDetail {
  readonly text: string;
  readonly truncated: boolean;
}

const safeStringify = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

export const formatActivityDetail = (value: unknown): FormattedActivityDetail => {
  const redacted = redactForLog(value);
  const text = safeStringify(redacted);
  if (text.length <= LIMITS.maxActivityDetailCharacters) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, LIMITS.maxActivityDetailCharacters), truncated: true };
};
