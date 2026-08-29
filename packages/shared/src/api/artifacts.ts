import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Artifact, ArtifactAttempt, ArtifactListResponse, SubmitAttemptInput } from "../schemas/artifact.ts";
import { RewriteBlockInput, RewrittenBlock, SaveNoteInput } from "../schemas/note.ts";
import {
  ArtifactNotFound,
  ArtifactStorageError,
  ArtifactTypeMismatch,
  BlockNotFound,
  NoteLimitExceeded,
  RewriteFailed,
  UnknownBlock
} from "../errors/artifact-errors.ts";
import { RateLimited } from "../errors/limit-exceeded.ts";

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
    }),
    // Reescribir un bloque: manda al modelo solo el texto del bloque y su fragmento cacheado
    // (F2-17), devuelve la propuesta y no guarda nada (decisión 8). Cuenta contra el cubo de
    // mensajes porque gasta una llamada al modelo.
    HttpApiEndpoint.post("rewriteBlock", "/:id/blocks/:blockId/rewrite", {
      params: {
        id: Schema.String,
        blockId: Schema.String
      },
      payload: RewriteBlockInput,
      success: RewrittenBlock,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        BlockNotFound.pipe(HttpApiSchema.status(404)),
        RewriteFailed.pipe(HttpApiSchema.status(502)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Borrar un apunte para poder regenerarlo: un material tiene como mucho un apunte (fase 2,
    // decisión 19), así que sin borrado no habría forma de rehacerlo.
    HttpApiEndpoint.delete("deleteArtifact", "/:id", {
      params: {
        id: Schema.String
      },
      success: HttpApiSchema.NoContent,
      error: [
        ArtifactNotFound.pipe(HttpApiSchema.status(404)),
        ArtifactStorageError.pipe(HttpApiSchema.status(500))
      ]
    })
  )
  .prefix("/artifacts")
{}
