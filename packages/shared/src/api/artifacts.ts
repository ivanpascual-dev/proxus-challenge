import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Artifact, ArtifactAttempt, ArtifactListResponse, SubmitAttemptInput } from "../schemas/artifact.ts";
import { SaveNoteInput } from "../schemas/note.ts";
import {
  ArtifactNotFound,
  ArtifactStorageError,
  ArtifactTypeMismatch,
  NoteLimitExceeded,
  UnknownBlock
} from "../errors/artifact-errors.ts";

const ArtifactKindQuery = Schema.Struct({
  kind: Schema.optional(Schema.Union([
    Schema.Literal("note"),
    Schema.Literal("quiz"),
    Schema.Literal("test")
  ]))
});

export class ArtifactsApi extends HttpApiGroup.make("artifacts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: ArtifactKindQuery,
      success: ArtifactListResponse,
      error: [ArtifactStorageError.pipe(HttpApiSchema.status(500))]
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: {
        id: Schema.String
      },
      success: Artifact,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    HttpApiEndpoint.post("submit", "/:id/submit", {
      params: {
        id: Schema.String
      },
      payload: SubmitAttemptInput,
      success: ArtifactAttempt,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Un solo endpoint de escritura para el apunte: editar, añadir, reordenar, borrar y marcar son la
    // misma operación (decisión 3). Se manda la nota entera; el último que guarda manda.
    HttpApiEndpoint.put("saveNote", "/:id/note", {
      params: {
        id: Schema.String
      },
      payload: SaveNoteInput,
      success: Artifact,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactTypeMismatch.pipe(HttpApiSchema.status(409)),
        NoteLimitExceeded.pipe(HttpApiSchema.status(400)),
        UnknownBlock.pipe(HttpApiSchema.status(400)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    })
  )
  .prefix("/artifacts")
{}
