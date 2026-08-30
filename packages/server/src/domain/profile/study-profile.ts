import { Context, Data, Effect, Layer } from "effect";
import type { StoredStudyProfile, StudyProfile, TopicStudyProfile } from "@proxus/shared";
import {
  ArtifactRepository,
  type GradedAttempt,
  type QuizArtifact,
  type TestArtifact
} from "../artifacts/artifact.ts";
import { MaterialRepository } from "../materials/material.ts";
import { emptyProfile, rebuildProfile } from "./profile-update.ts";

// El perfil de estudio como servicio del dominio (ADR-002). Dos operaciones:
//
// - `sync(materialId)`: recalcula el perfil desde los intentos `graded` del material y lo persiste.
//   Lo llama `attempt-service` al entregar y al registrar una discrepancia. Recalcular desde cero es
//   determinista e idempotente por construcción (§6.5): "esto sí lo dije" reescribe un intento ya
//   corregido y el perfil lo refleja sin un camino de reversión aparte.
// - `read(materialId)`: el perfil que viaja por HTTP. Resuelve al leer lo que no se persiste:
//   `topicLabel` desde el índice (riesgo 5) y `emphasis` desde los bloques marcados del apunte (§6.6,
//   ADR-003: señal separada). El modelo nunca lo escribe y no hay ninguna ruta que lo escriba.

export class StudyProfileError extends Data.TaggedError("StudyProfileError")<{
  readonly reason: string;
  // `true` = el material no existe (404); `false` = fallo de almacenamiento (500). El handler mapea.
  readonly notFound: boolean;
}> {}

export class StudyProfileRepositoryError extends Data.TaggedError("StudyProfileRepositoryError")<{
  readonly reason: unknown;
}> {}

// El puerto de persistencia, molde de `file-artifact-repository.ts`. `load` devuelve un perfil vacío
// si el material no tiene fichero todavía: no tener perfil no es un error.
export interface StudyProfileRepository {
  readonly load: (materialId: string) => Effect.Effect<StoredStudyProfile, StudyProfileRepositoryError>;
  readonly save: (profile: StoredStudyProfile) => Effect.Effect<void, StudyProfileRepositoryError>;
}

export const StudyProfileRepository = Context.Service<StudyProfileRepository>(
  "@proxus/server/profile/StudyProfileRepository"
);

export interface StudyProfileService {
  readonly sync: (materialId: string) => Effect.Effect<StoredStudyProfile, StudyProfileError>;
  readonly read: (materialId: string) => Effect.Effect<StudyProfile, StudyProfileError>;
}

export const StudyProfileService = Context.Service<StudyProfileService>(
  "@proxus/server/profile/StudyProfileService"
);

type Assessment = QuizArtifact | TestArtifact;

type NoteLike = {
  readonly blocks: readonly {
    readonly emphasis: boolean;
    readonly source: { readonly type: string; readonly pages?: readonly number[] } | null;
  }[];
};

// Un tema está marcado si algún bloque del apunte con `emphasis: true` cita una página que también
// está en las páginas del tema. Misma regla que usa la generación para el reparto (§6.6).
const emphasizedTopicIds = (
  note: NoteLike | undefined,
  topics: readonly { readonly id: string; readonly pages: readonly number[] }[]
): ReadonlySet<string> => {
  if (note === undefined) {
    return new Set();
  }
  const emphasizedPages = new Set<number>();
  for (const block of note.blocks) {
    if (block.emphasis && block.source?.type === "material") {
      for (const page of block.source.pages ?? []) {
        emphasizedPages.add(page);
      }
    }
  }
  return new Set(
    topics.filter((topic) => topic.pages.some((page) => emphasizedPages.has(page))).map((topic) => topic.id)
  );
};

const logAndFail = (context: string, reason: unknown) =>
  Effect.logWarning(`perfil de estudio: ${context}: ${String(reason)}`).pipe(
    Effect.andThen(new StudyProfileError({ reason: context, notFound: false }))
  );

export const make = (
  repository: StudyProfileRepository,
  artifacts: ArtifactRepository,
  materials: MaterialRepository
): StudyProfileService => {
  const sync = (materialId: string) => Effect.gen(function* () {
    const listing = yield* artifacts.listArtifacts().pipe(
      Effect.catch((error) => logAndFail("no se pudieron leer las pruebas del material", error._tag))
    );

    const assessmentsById = new Map<string, Assessment>(
      listing.artifacts
        .filter((artifact): artifact is Assessment =>
          (artifact.kind === "quiz" || artifact.kind === "test") && artifact.scope.materialId === materialId)
        .map((artifact) => [artifact.id, artifact])
    );

    const attempts = yield* artifacts.listAttempts().pipe(
      Effect.catch((error) => logAndFail("no se pudieron leer los intentos del material", error._tag))
    );

    const entries = attempts
      .filter((attempt): attempt is GradedAttempt => attempt.status === "graded")
      .map((attempt) => ({ attempt, artifact: assessmentsById.get(attempt.artifactId) }))
      .filter((entry): entry is { attempt: GradedAttempt; artifact: Assessment } => entry.artifact !== undefined)
      .sort((a, b) => a.attempt.submittedAt.localeCompare(b.attempt.submittedAt));

    const next = rebuildProfile(materialId, entries, new Date().toISOString());
    const current = yield* repository.load(materialId).pipe(
      Effect.catch(() => Effect.succeed(emptyProfile(materialId)))
    );
    // Si los contadores no han cambiado respecto a lo guardado, no se reescribe el fichero.
    const same = (profile: StoredStudyProfile) => JSON.stringify({ ...profile, updatedAt: null });
    if (same(current) === same(next)) {
      return current;
    }
    yield* repository.save(next).pipe(
      Effect.catch((error) => logAndFail("no se pudo guardar el perfil", error.reason))
    );
    return next;
  });

  const read = (materialId: string) => Effect.gen(function* () {
    yield* materials.get(materialId).pipe(
      Effect.catchTag("MaterialNotFound", () =>
        new StudyProfileError({ reason: `no hay ningún material con id ${materialId}`, notFound: true })),
      Effect.catchTag("MaterialRepositoryError", (error) => logAndFail("no se pudo cargar el material", error.reason))
    );

    const stored = yield* repository.load(materialId).pipe(
      Effect.catch((error) => logAndFail("no se pudo leer el perfil", error.reason))
    );

    // El índice puede no existir (material sin indexar) o haberse reindexado: la etiqueta cae al
    // `topicId` y `emphasis` a `false` en ese caso, en vez de fallar.
    const index = yield* materials.getIndex(materialId).pipe(Effect.catch(() => Effect.succeed(null)));
    const noteListing = yield* artifacts.listArtifacts({ kind: "note" }).pipe(
      Effect.catch(() => Effect.succeed({ artifacts: [], unreadable: [] }))
    );
    const found = noteListing.artifacts.find(
      (artifact) => artifact.kind === "note" && artifact.materialId === materialId
    );
    const note: NoteLike | undefined = found !== undefined && found.kind === "note" ? found : undefined;

    const topics = index?.topics ?? [];
    const labelOf = new Map(topics.map((topic) => [topic.id, topic.label]));
    const emphasized = emphasizedTopicIds(note, topics);

    const rows = new Map<string, TopicStudyProfile>();
    for (const topic of stored.topics) {
      rows.set(topic.topicId, {
        ...topic,
        topicLabel: labelOf.get(topic.topicId) ?? topic.topicId,
        emphasis: emphasized.has(topic.topicId)
      });
    }
    // Un tema marcado sin actividad también sale: la marca es una señal por sí sola (ADR-003).
    for (const topicId of emphasized) {
      if (!rows.has(topicId)) {
        rows.set(topicId, {
          topicId,
          topicLabel: labelOf.get(topicId) ?? topicId,
          correct: 0,
          incorrect: 0,
          unevaluated: 0,
          blank: 0,
          hintsRevealed: 0,
          emphasis: true
        });
      }
    }

    // Orden del índice; los temas que ya no están en el índice, al final.
    const orderOf = new Map(topics.map((topic, position) => [topic.id, position] as const));
    const ordered = [...rows.values()].sort(
      (a, b) => (orderOf.get(a.topicId) ?? Number.MAX_SAFE_INTEGER) - (orderOf.get(b.topicId) ?? Number.MAX_SAFE_INTEGER)
    );

    return { materialId, topics: ordered, updatedAt: stored.updatedAt } satisfies StudyProfile;
  });

  return { sync, read };
};

export const StudyProfileServiceLive = Layer.effect(StudyProfileService)(
  Effect.gen(function* () {
    const repository = yield* StudyProfileRepository;
    const artifacts = yield* ArtifactRepository;
    const materials = yield* MaterialRepository;
    return make(repository, artifacts, materials);
  })
);
