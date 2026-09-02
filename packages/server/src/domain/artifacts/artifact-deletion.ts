import { Effect } from "effect";
import type { ArtifactRepository, ArtifactRepositoryError } from "./artifact.ts";

// Borrar un Control o Examen se lleva sus intentos guardados aparte (`.data/artifacts/attempts`):
// borrar solo el artefacto los deja huérfanos, apuntando a un artifactId que ya no existe. Misma
// cascada que hace `material-deletion-service.ts` al borrar un material entero; aquí es un solo
// artefacto, así que no hace falta un servicio propio, con `ArtifactRepository` sobra. Un apunte no
// tiene intentos: el listado sale vacío y el paso no hace nada.
export const deleteArtifactCascade = (
  artifacts: ArtifactRepository,
  artifactId: string
): Effect.Effect<void, ArtifactRepositoryError> => Effect.gen(function* () {
  const attempts = yield* artifacts.listAttempts(artifactId);
  yield* Effect.forEach(attempts, (attempt) => artifacts.deleteAttempt(attempt.id), { discard: true });
  yield* artifacts.deleteArtifact(artifactId);
});
