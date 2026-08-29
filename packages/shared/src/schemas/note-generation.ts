import { Schema } from "effect";
import { ArtifactSummary } from "./artifact.ts";

// Eventos del stream NDJSON de POST /api/materials/:id/notes. Espejo de `MaterialIndexStreamEvent`:
// generar apuntes es un servicio del dominio con su ruta, no una capacidad del tutor (fase 2,
// decisión 24). `topic` es null en la fase de guardado.
export const NoteGenerationStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("progress"),
    topic: Schema.NullOr(Schema.Number),
    topicCount: Schema.Number,
    message: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("done"),
    note: ArtifactSummary
  }),
  Schema.Struct({
    type: Schema.Literal("failed"),
    message: Schema.String
  })
]);
export type NoteGenerationStreamEvent = typeof NoteGenerationStreamEvent.Type;
