import { Context, Effect, Layer, Option, Result } from "effect";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  ArtifactTypeMismatch as ApiArtifactTypeMismatch,
  type MaterialIndex,
  type NoteLimitExceeded,
  type UnknownBlock
} from "@proxus/shared";
import {
  MaterialRepository,
  type MaterialRepositoryError
} from "../materials/material.ts";
import {
  ArtifactRepository,
  type Artifact,
  type NoteArtifact,
  type NoteBlock,
  type SaveNoteInput,
  type ArtifactRepositoryError
} from "./artifact.ts";
import { applyBlockInputs, checkNoteLimits } from "./note-blocks.ts";
import { buildMaterialExcerpt } from "./note-source.ts";

// Compone `ArtifactRepository` y `MaterialRepository`. Es lo que impide que el repositorio de
// artefactos sepa de materiales.
export interface NoteService {
  readonly saveNote: (
    id: string,
    input: SaveNoteInput
  ) => Effect.Effect<
    Artifact,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | NoteLimitExceeded | UnknownBlock | ApiArtifactStorageError
  >;
  // Rellena el fragmento cacheado de cada bloque con fuente de material desde el índice (una vez por
  // material, no por bloque). Un material inexistente o sin indexar se convierte en `unanchoredReason`,
  // no en un error: guardar el apunte funciona aunque la cita no ancle (decisión 5).
  readonly resolveSources: (
    blocks: readonly NoteBlock[]
  ) => Effect.Effect<readonly NoteBlock[], MaterialRepositoryError>;
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

type IndexLookup =
  | { readonly ok: true; readonly index: MaterialIndex }
  | { readonly ok: false; readonly reason: string };

export const make = (repository: ArtifactRepository, materials: MaterialRepository): NoteService => {
  const resolveSources = (blocks: readonly NoteBlock[]) => Effect.gen(function* () {
    const materialIds = [
      ...new Set(
        blocks.flatMap((block) => (block.source?.type === "material" ? [block.source.materialId] : []))
      )
    ];

    const lookups = new Map<string, IndexLookup>();
    for (const materialId of materialIds) {
      const lookup = yield* materials.getIndex(materialId).pipe(
        Effect.map((index): IndexLookup => ({ ok: true, index })),
        Effect.catchTag("MaterialNotFound", () =>
          Effect.succeed<IndexLookup>({ ok: false, reason: `no hay ningún material con id ${materialId}` })
        ),
        Effect.catchTag("MaterialNotIndexed", () =>
          Effect.succeed<IndexLookup>({ ok: false, reason: `el material ${materialId} no está indexado todavía` })
        )
      );
      lookups.set(materialId, lookup);
    }

    return blocks.map((block): NoteBlock => {
      if (block.source?.type !== "material") {
        return block;
      }

      const lookup = lookups.get(block.source.materialId);
      if (lookup === undefined || !lookup.ok) {
        return {
          ...block,
          source: {
            ...block.source,
            excerpt: null,
            excerptTruncated: false,
            transcribed: false,
            unanchoredReason: lookup?.reason ?? "no se pudo cargar el índice del material"
          }
        };
      }

      return {
        ...block,
        source: { ...block.source, ...buildMaterialExcerpt(lookup.index, block.source.pages) }
      };
    });
  });

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

    const withSources = yield* resolveSources(blocks.success).pipe(
      Effect.mapError((error) => storageError(`índice del material: ${String(error.reason)}`))
    );

    const saved: NoteArtifact = { ...artifact, title: input.title, blocks: withSources };
    yield* repository.saveArtifact(saved).pipe(Effect.mapError((error) => storageError(error._tag)));
    return saved;
  });

  return { saveNote, resolveSources };
};

export const NoteServiceLive = Layer.effect(NoteService)(
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const materials = yield* MaterialRepository;
    return make(repository, materials);
  })
);
