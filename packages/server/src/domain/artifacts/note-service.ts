import { Context, Effect, Layer, Option, Result, Schema } from "effect";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  ArtifactTypeMismatch as ApiArtifactTypeMismatch,
  type BlockNotFound,
  type MaterialIndex,
  type NoteLimitExceeded,
  type ProposalNotFound,
  type ProposalStale,
  type TooManyProposals,
  type UnknownBlock
} from "@proxus/shared";
import {
  MaterialRepository,
  type MaterialRepositoryError
} from "../materials/material.ts";
import {
  ArtifactRepository,
  NoteBlockInputSource,
  type Artifact,
  type NoteArtifact,
  type NoteBlock,
  type NoteProposal,
  type SaveNoteInput,
  type ArtifactRepositoryError
} from "./artifact.ts";
import {
  addProposal,
  applyBlockInputs,
  applyProposal,
  bindProposalTarget,
  checkNoteLimits,
  rejectProposal,
  resolveInputSource
} from "./note-blocks.ts";
import { buildMaterialExcerpt } from "./note-source.ts";

// Lo que el tutor manda por `artifacts note propose`. Más suelto que `NoteProposalOperation` del
// contrato: el tutor no rellena `id`, `author`, `emphasis`, el fragmento cacheado de la fuente ni
// `baseMarkdown`, eso lo pone el servidor (invariante 8, decisión 4; ADR-014 enmienda 2026-08-29).
// Así el tutor no tiene que reproducir el texto viejo del bloque dentro del JSON. Vive solo en el
// dominio: no hay handler HTTP que lo decodifique (el alumno no propone, solo acepta), así que en
// `shared` sería código muerto (§12.4).
export const ProposeNoteChangeInput = Schema.Struct({
  rationale: Schema.String,
  operation: Schema.Union([
    Schema.Struct({
      type: Schema.Literal("insert"),
      afterBlockId: Schema.NullOr(Schema.String),
      markdown: Schema.String,
      source: Schema.optional(NoteBlockInputSource)
    }),
    Schema.Struct({
      type: Schema.Literal("replace"),
      blockId: Schema.String,
      markdown: Schema.String
    }),
    Schema.Struct({
      type: Schema.Literal("remove"),
      blockId: Schema.String
    })
  ])
});
export type ProposeNoteChangeInput = typeof ProposeNoteChangeInput.Type;

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
  // El tutor propone; la propuesta se guarda como pendiente y no toca ningún bloque (F2-26, ADR-014).
  readonly proposeChange: (
    id: string,
    input: ProposeNoteChangeInput
  ) => Effect.Effect<
    NoteArtifact,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | BlockNotFound | TooManyProposals | ApiArtifactStorageError
  >;
  // El alumno acepta: se aplica y se retira de las pendientes (F2-28). Si el bloque cambió desde que
  // el tutor lo vio, `ProposalStale` y no se aplica nada (F2-29).
  readonly acceptProposal: (
    id: string,
    proposalId: string
  ) => Effect.Effect<
    NoteArtifact,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | ProposalNotFound | ProposalStale | ApiArtifactStorageError
  >;
  // El alumno descarta: se retira sin aplicarla (F2-28).
  readonly rejectProposal: (
    id: string,
    proposalId: string
  ) => Effect.Effect<
    NoteArtifact,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | ProposalNotFound | ApiArtifactStorageError
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

  const loadNote = (id: string) => repository.getArtifact(id).pipe(
    Effect.mapError(repositoryFailure(id)),
    Effect.flatMap((artifact) => artifact.kind === "note"
      ? Effect.succeed(artifact)
      : new ApiArtifactTypeMismatch({
          artifactId: id,
          expected: "note",
          actual: artifact.kind,
          message: `El artefacto ${id} es de tipo ${artifact.kind}, no un apunte.`
        }))
  );

  const persist = (note: NoteArtifact) => repository.saveArtifact(note).pipe(
    Effect.mapError((error) => storageError(error._tag)),
    Effect.as(note)
  );

  const proposeChange = (id: string, input: ProposeNoteChangeInput) => Effect.gen(function* () {
    const note = yield* loadNote(id);
    const operation = input.operation;

    let proposalOperation: NoteProposal["operation"];
    if (operation.type === "insert") {
      // El bloque propuesto pasa por el mismo camino que un bloque nuevo del editor: sin id (lo
      // genera `applyProposal` al aceptar), autoría del tutor, y el fragmento de la fuente lo
      // resuelve el servidor desde el índice, nunca el modelo (invariante 8).
      const draft: NoteBlock = {
        id: crypto.randomUUID(),
        markdown: operation.markdown,
        author: "tutor",
        emphasis: false,
        source: resolveInputSource(operation.source ?? null)
      };
      const [block] = yield* resolveSources([draft]).pipe(
        Effect.mapError((error) => storageError(`índice del material: ${String(error.reason)}`))
      );
      proposalOperation = { type: "insert", afterBlockId: operation.afterBlockId, block: block! };
    } else {
      // replace y remove: el servidor lee el texto actual del bloque y lo guarda como `baseMarkdown`
      // de la propuesta (ADR-014 enmienda 2026-08-29). Un blockId que no está es BlockNotFound.
      const bound = bindProposalTarget(note.blocks, operation);
      if (Result.isFailure(bound)) {
        return yield* bound.failure;
      }
      proposalOperation = bound.success;
    }

    const proposal: NoteProposal = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      rationale: input.rationale,
      operation: proposalOperation
    };

    const withProposal = addProposal(note, proposal);
    if (Result.isFailure(withProposal)) {
      return yield* withProposal.failure;
    }
    return yield* persist(withProposal.success);
  });

  const acceptProposal = (id: string, proposalId: string) => Effect.gen(function* () {
    const note = yield* loadNote(id);
    const applied = applyProposal(note, proposalId);
    if (Result.isFailure(applied)) {
      return yield* applied.failure;
    }
    return yield* persist(applied.success);
  });

  const rejectProposalById = (id: string, proposalId: string) => Effect.gen(function* () {
    const note = yield* loadNote(id);
    const rejected = rejectProposal(note, proposalId);
    if (Result.isFailure(rejected)) {
      return yield* rejected.failure;
    }
    return yield* persist(rejected.success);
  });

  const saveNote = (id: string, input: SaveNoteInput) => Effect.gen(function* () {
    const limit = checkNoteLimits(input);
    if (Option.isSome(limit)) {
      return yield* limit.value;
    }

    const artifact = yield* loadNote(id);

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

  return { saveNote, resolveSources, proposeChange, acceptProposal, rejectProposal: rejectProposalById };
};

export const NoteServiceLive = Layer.effect(NoteService)(
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const materials = yield* MaterialRepository;
    return make(repository, materials);
  })
);
