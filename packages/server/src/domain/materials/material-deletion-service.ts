import { Context, Effect, Layer } from "effect";
import { ArtifactRepository, type Artifact, type ArtifactRepositoryError } from "../artifacts/artifact.ts";
import { MaterialNotFound, MaterialRepository, MaterialRepositoryError } from "./material.ts";

// Borrar un material se lleva sus artefactos (apunte, controles, exámenes): dejarlos huérfanos es lo
// que producía el choque al resubir el mismo PDF (el materialId sale del nombre del fichero,
// ADR-011, así que resubir reencarna el id de un material ya borrado). El usuario decide borrar y la
// interfaz avisa de la pérdida antes de llamar; el servidor no pregunta dos veces.

export interface MaterialDeletionService {
  readonly remove: (
    materialId: string
  ) => Effect.Effect<void, MaterialNotFound | MaterialRepositoryError | ArtifactRepositoryError>;
}

export const MaterialDeletionService = Context.Service<MaterialDeletionService>(
  "@proxus/server/materials/MaterialDeletionService"
);

const ownsMaterial = (materialId: string) => (artifact: Artifact): boolean =>
  artifact.kind === "note" ? artifact.materialId === materialId : artifact.scope.materialId === materialId;

export const make = (
  materials: MaterialRepository,
  artifacts: ArtifactRepository
): MaterialDeletionService => {
  const remove = (materialId: string) => Effect.gen(function* () {
    // Confirma que el material existe antes de tocar nada (mismo `MaterialNotFound` que el resto de
    // rutas de materiales).
    yield* materials.get(materialId);

    const listing = yield* artifacts.listArtifacts();
    const own = listing.artifacts.filter(ownsMaterial(materialId));

    // Un control o examen puede tener intentos guardados aparte (`.data/artifacts/attempts`):
    // borrar solo el artefacto los deja huérfanos, apuntando a un artifactId que ya no existe.
    yield* Effect.forEach(own, (artifact) => Effect.gen(function* () {
      const attempts = yield* artifacts.listAttempts(artifact.id);
      yield* Effect.forEach(attempts, (attempt) => artifacts.deleteAttempt(attempt.id), { discard: true });
      yield* artifacts.deleteArtifact(artifact.id);
    }), { discard: true });

    yield* materials.remove(materialId);
  });

  return { remove };
};

export const MaterialDeletionServiceLive = Layer.effect(MaterialDeletionService)(
  Effect.gen(function* () {
    const materials = yield* MaterialRepository;
    const artifacts = yield* ArtifactRepository;
    return make(materials, artifacts);
  })
);
