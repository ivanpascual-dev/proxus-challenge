import { Schema } from "effect";

export const UserMessage = Schema.Struct({
  role: Schema.Literal("user"),
  content: Schema.String
});
export type UserMessage = typeof UserMessage.Type;

export const AssistantMessage = Schema.Struct({
  role: Schema.Literal("assistant"),
  content: Schema.String
});
export type AssistantMessage = typeof AssistantMessage.Type;

export const ToolCallMessage = Schema.Struct({
  role: Schema.Literal("tool-call"),
  name: Schema.String,
  input: Schema.Unknown
});
export type ToolCallMessage = typeof ToolCallMessage.Type;

// `result` se queda en `Schema.Unknown` a propósito. La palanca 1 (fase 4, decisión 10) degrada un
// `material-page-images` a `{ type, material, pages: [{ page, mediaType }], omitted: true }` sin
// `data`, pero sigue siendo JSON arbitrario de cada comando: acotarlo aquí exigiría un esquema por
// forma de resultado, y el harness ya valida lo que le importa al leerlo.
export const ToolResultMessage = Schema.Struct({
  role: Schema.Literal("tool-result"),
  name: Schema.String,
  result: Schema.Unknown,
  isFailure: Schema.Boolean
});
export type ToolResultMessage = typeof ToolResultMessage.Type;

export const AgentMessage = Schema.Union([
  UserMessage,
  AssistantMessage,
  ToolCallMessage,
  ToolResultMessage
]);
export type AgentMessage = typeof AgentMessage.Type;
