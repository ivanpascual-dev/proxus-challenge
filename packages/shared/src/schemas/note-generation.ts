import { Schema } from "effect";
import { ArtifactSummary } from "./artifact.ts";

// Eventos del stream NDJSON de POST /api/materials/:id/notes. Espejo de `MaterialIndexStreamEvent`:
// generar apuntes es un servicio del dominio con su ruta, no una capacidad del tutor (fase 2,
// decisión 24). `topic` es null en la fase de guardado.
// El material ya tiene un apunte (fase 2, decisión 19). La ruta la comprueba ANTES de abrir el
// stream y responde 409 con este cuerpo: intentar generar sobre un material que ya tiene apunte es
// un conflicto, no un fallo a mitad de generación. `noteId` deja al cliente enlazar al apunte que
// ya existe.
export class NoteAlreadyExists extends Schema.ErrorClass<NoteAlreadyExists>("NoteAlreadyExists")({
  _tag: Schema.tag("NoteAlreadyExists"),
  materialId: Schema.String,
  noteId: Schema.String,
  message: Schema.String
}) {}

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
