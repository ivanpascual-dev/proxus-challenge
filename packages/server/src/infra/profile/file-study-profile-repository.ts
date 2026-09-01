import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { StoredStudyProfile } from "@proxus/shared";
import {
  StudyProfileRepository,
  StudyProfileRepositoryError,
  type StudyProfileRepository as StudyProfileRepositoryType
} from "../../domain/profile/study-profile.ts";
import { emptyProfile } from "../../domain/profile/profile-update.ts";

// Persistencia del perfil de estudio en `.data/profile/<materialId>.json`. Molde de
// `file-artifact-repository.ts`: `make(directory)` devuelve el puerto, `layer(directory)` lo envuelve.
// `.data/` no se sube nunca (packages/server/CLAUDE.md).

const StoredStudyProfileFromJson = Schema.fromJsonString(StoredStudyProfile);

export const FileStudyProfileRepository = {
  make: (directory: string): Effect.Effect<StudyProfileRepositoryType, never, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const profilePath = (materialId: string) => path.join(directory, `${encodeURIComponent(materialId)}.json`);
      const mapError = (reason: unknown) => new StudyProfileRepositoryError({ reason });

      const load = (materialId: string) => Effect.gen(function* () {
        const filePath = profilePath(materialId);
        const exists = yield* fs.exists(filePath).pipe(Effect.mapError(mapError));
        if (!exists) {
          // No tener perfil todavía no es un error: es un perfil vacío.
          return emptyProfile(materialId);
        }
        const text = yield* fs.readFileString(filePath).pipe(Effect.mapError(mapError));
        return yield* Schema.decodeUnknownEffect(StoredStudyProfileFromJson)(text).pipe(Effect.mapError(mapError));
      });

      const save = (profile: StoredStudyProfile) => Effect.gen(function* () {
        const encoded = yield* Schema.encodeUnknownEffect(StoredStudyProfile)(profile).pipe(Effect.mapError(mapError));
        const json = JSON.stringify(encoded, null, 2);
        yield* fs.makeDirectory(directory, { recursive: true }).pipe(Effect.mapError(mapError));
        yield* fs.writeFileString(profilePath(profile.materialId), `${json}\n`).pipe(Effect.mapError(mapError));
      });

      const remove = (materialId: string) => Effect.gen(function* () {
        const filePath = profilePath(materialId);
        const exists = yield* fs.exists(filePath).pipe(Effect.mapError(mapError));
        if (!exists) {
          return;
        }
        yield* fs.remove(filePath).pipe(Effect.mapError(mapError));
      });

      return { load, save, remove };
    }),
  layer: (directory: string) => Layer.effect(StudyProfileRepository)(FileStudyProfileRepository.make(directory))
};
