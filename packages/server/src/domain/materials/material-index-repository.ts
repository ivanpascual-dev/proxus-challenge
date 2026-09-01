import { Context, Data, Effect, Option } from "effect";
import type { MaterialIndexContent } from "@proxus/shared";

export class MaterialIndexRepositoryError extends Data.TaggedError("MaterialIndexRepositoryError")<{
  readonly reason: unknown;
}> {}

export interface MaterialIndexRepository {
  // El índice guardado para un contenido exacto, o none si hay que construirlo. Solo el contenido:
  // la identidad (materialId, fileName) se resuelve fuera, contra el fichero que hoy tiene la huella.
  readonly getByHash: (
    contentHash: string
  ) => Effect.Effect<Option.Option<MaterialIndexContent>, MaterialIndexRepositoryError>;
  readonly put: (content: MaterialIndexContent) => Effect.Effect<void, MaterialIndexRepositoryError>;
  // Borra los índices cuya huella ya no corresponde a ningún PDF presente. Devuelve las huellas
  // borradas. Explícito, nunca automático: un índice huérfano vuelve a servir si se deshace la
  // edición del PDF (git checkout, copia restaurada).
  readonly prune: (
    liveHashes: readonly string[]
  ) => Effect.Effect<readonly string[], MaterialIndexRepositoryError>;
  // Borra el índice archivado de una única huella (ADR-027): lo llama el borrado de un material cuando
  // era la última referencia viva a esa huella. La ausencia del fichero es éxito idempotente.
  readonly removeByHash: (contentHash: string) => Effect.Effect<void, MaterialIndexRepositoryError>;
}

export const MaterialIndexRepository = Context.Service<MaterialIndexRepository>(
  "@proxus/server/materials/MaterialIndexRepository"
);
