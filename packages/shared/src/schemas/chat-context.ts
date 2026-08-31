import { Schema } from "effect";

// Lo que está en pantalla y viaja al tutor por referencia (fase 4, decisión 5, enmienda ADR-006): se
// propone solo, se ve antes de enviar y se puede quitar (invariante 9). Solo identificadores y
// título, nunca texto libre: si no se puede pegar contenido, no se puede colar contenido.

export const MaterialContextRef = Schema.Struct({
  type: Schema.Literal("material"),
  materialId: Schema.String,
  title: Schema.String
});
export type MaterialContextRef = typeof MaterialContextRef.Type;

export const ArtifactContextRef = Schema.Struct({
  type: Schema.Literal("artifact"),
  artifactId: Schema.String,
  title: Schema.String
});
export type ArtifactContextRef = typeof ArtifactContextRef.Type;

export const BlockContextRef = Schema.Struct({
  type: Schema.Literal("block"),
  artifactId: Schema.String,
  blockId: Schema.String,
  title: Schema.String
});
export type BlockContextRef = typeof BlockContextRef.Type;

export const ChatContextRef = Schema.Union([
  MaterialContextRef,
  ArtifactContextRef,
  BlockContextRef
]);
export type ChatContextRef = typeof ChatContextRef.Type;
