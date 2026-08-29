import { Context, Effect, Layer, Option, Result } from "effect";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  ArtifactTypeMismatch as ApiArtifactTypeMismatch,
  type NoteLimitExceeded,
  type UnknownBlock
} from "@proxus/shared";
import {
  ArtifactRepository,
  type Artifact,
  type NoteArtifact,
  type SaveNoteInput,
  type ArtifactRepositoryError
} from "./artifact.ts";
import { applyBlockInputs, checkNoteLimits } from "./note-blocks.ts";

// Compone `ArtifactRepository` (y, desde el tramo 2B, `MaterialRepository`). Es lo que impide que el
// repositorio de artefactos sepa de materiales.
export interface NoteService {
  readonly saveNote: (
    id: string,
    input: SaveNoteInput
  ) => Effect.Effect<
    Artifact,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | NoteLimitExceeded | UnknownBlock | ApiArtifactStorageError
  >;
}

export const NoteService = Context.Service<NoteService>("@proxus/server/artifacts/NoteService");

const storageError = (reason: unknown) =>
  new ApiArtifactStorageError({
    message: `No se pudo leer o escribir el apunte en el almacenamiento: ${String(reason)}`
  });

const repositoryFailure = (id: string) => (error: ArtifactRepositoryError): ApiArtifactNotFound | ApiArtifactStorageError =>
  error._tag === "ArtifactNotFound"
    ? new ApiArtifactNotFound({ artifactId: id, message: `No hay ningún artefacto con id ${id}.` })
    : storageError("reason" in error ? error.reason : error._tag);

export const make = (repository: ArtifactRepository): NoteService => {
  const saveNote = (id: string, input: SaveNoteInput) => Effect.gen(function* () {
    const limit = checkNoteLimits(input);
    if (Option.isSome(limit)) {
      return yield* limit.value;
    }

    const artifact = yield* repository.getArtifact(id).pipe(Effect.mapError(repositoryFailure(id)));

    if (artifact.kind !== "note") {
      return yield* new ApiArtifactTypeMismatch({
        artifactId: id,
        expected: "note",
        actual: artifact.kind,
        message: `El artefacto ${id} es de tipo ${artifact.kind}, no un apunte.`
      });
    }

    const blocks = applyBlockInputs(artifact.blocks, input.blocks);
    if (Result.isFailure(blocks)) {
      return yield* blocks.failure;
    }

    const saved: NoteArtifact = { ...artifact, title: input.title, blocks: blocks.success };
    yield* repository.saveArtifact(saved).pipe(Effect.mapError((error) => storageError(error._tag)));
    return saved;
  });

  return { saveNote };
};

export const NoteServiceLive = Layer.effect(NoteService)(
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    return make(repository);
  })
);
