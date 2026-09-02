import { Context, Data, Effect, Layer } from "effect";
import { ArtifactRepository, type Artifact } from "../artifacts/artifact.ts";
import { MaterialNotFound, MaterialRepository } from "./material.ts";
import { StudyProfileRepository } from "../profile/study-profile.ts";

// Borrar un material se lleva sus artefactos (apunte, controles, exámenes), su perfil de estudio y,
// cuando era la última referencia viva a su huella, el índice y las páginas cacheadas (ADR-024,
// ADR-027). Dejar huérfanos los artefactos es lo que producía el choque al resubir el mismo PDF (el
// materialId sale del nombre del fichero, ADR-011, así que resubir reencarna el id de un material ya
// borrado). El usuario decide borrar y la interfaz avisa de la pérdida antes de llamar; el servidor no
// pregunta dos veces.

// Envuelve el fallo concreto de cualquier paso de la cascada (artefactos, intentos, perfil o el propio
// repositorio de materiales), salvo `MaterialNotFound`, que se deja propagar tal cual porque el
// handler la traduce a 404. Así el llamador solo tiene dos casos que mapear, nunca un `Effect.orDie`.
export class MaterialDeletionError extends Data.TaggedError("MaterialDeletionError")<{
  readonly reason: unknown;
}> {}

export interface MaterialDeletionService {
  readonly remove: (materialId: string) => Effect.Effect<void, MaterialNotFound | MaterialDeletionError>;
}

export const MaterialDeletionService = Context.Service<MaterialDeletionService>(
  "@proxus/server/materials/MaterialDeletionService"
);

const ownsMaterial = (materialId: string) => (artifact: Artifact): boolean =>
  artifact.kind === "note" ? artifact.materialId === materialId : artifact.scope.materialId === materialId;

const wrapReason = (reason: unknown) => new MaterialDeletionError({ reason });

export const make = (
  materials: MaterialRepository,
  artifacts: ArtifactRepository,
  profile: StudyProfileRepository
): MaterialDeletionService => {
  const remove = (materialId: string) => Effect.gen(function* () {
    // Confirma que el material existe antes de tocar nada (mismo `MaterialNotFound` que el resto de
    // rutas de materiales; un fallo de almacenamiento se envuelve).
    yield* materials.get(materialId).pipe(Effect.catchTag("MaterialRepositoryError", (error) => Effect.fail(wrapReason(error))));

    const listing = yield* artifacts.listArtifacts().pipe(Effect.mapError(wrapReason));
    const own = listing.artifacts.filter(ownsMaterial(materialId));

    // Un control o examen puede tener intentos guardados aparte (`.data/artifacts/attempts`):
    // borrar solo el artefacto los deja huérfanos, apuntando a un artifactId que ya no existe.
    yield* Effect.forEach(own, (artifact) => Effect.gen(function* () {
      const attempts = yield* artifacts.listAttempts(artifact.id).pipe(Effect.mapError(wrapReason));
      yield* Effect.forEach(
        attempts,
        (attempt) => artifacts.deleteAttempt(attempt.id).pipe(Effect.mapError(wrapReason)),
        { discard: true }
      );
      yield* artifacts.deleteArtifact(artifact.id).pipe(Effect.mapError(wrapReason));
    }), { discard: true });

    // El perfil se borra siempre por `materialId` (no se comparte entre materiales, ADR-027).
    yield* profile.remove(materialId).pipe(Effect.mapError(wrapReason));

    // Derivados por huella (índice, páginas cacheadas) y PDF al final: `MaterialRepository.remove`
    // decide solos si era la última referencia (ADR-027).
    yield* materials.remove(materialId).pipe(Effect.catchTag("MaterialRepositoryError", (error) => Effect.fail(wrapReason(error))));
  });

  return { remove };
};

export const MaterialDeletionServiceLive = Layer.effect(MaterialDeletionService)(
  Effect.gen(function* () {
    const materials = yield* MaterialRepository;
    const artifacts = yield* ArtifactRepository;
    const profile = yield* StudyProfileRepository;
    return make(materials, artifacts, profile);
  })
);
