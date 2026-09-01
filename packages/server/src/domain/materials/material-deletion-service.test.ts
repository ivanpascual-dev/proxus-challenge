import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer } from "effect";
import { ArtifactRepository, ArtifactNotFound, type Artifact, type QuizArtifact, type NoteArtifact } from "../artifacts/artifact.ts";
import { MaterialDeletionService, MaterialDeletionServiceLive } from "./material-deletion-service.ts";
import { MaterialNotFound, MaterialRepository, type PdfMaterial } from "./material.ts";

const material: PdfMaterial = {
  id: "densidad",
  title: "Densidad",
  fileName: "densidad.pdf",
  pageCount: 4,
  uploadedAt: "2026-08-01T00:00:00.000Z",
  indexState: "indexed"
};

const otherMaterial: PdfMaterial = { ...material, id: "otro", title: "Otro", fileName: "otro.pdf" };

const note: NoteArtifact = {
  kind: "note",
  id: "note-1",
  title: "Apuntes de Densidad",
  materialId: material.id,
  blocks: [],
  proposals: []
};

const quiz: QuizArtifact = {
  kind: "quiz",
  id: "quiz-1",
  title: "Control de Densidad",
  questions: [],
  scope: { materialId: material.id, topicId: null, topicLabel: "Densidad" },
  origin: "material",
  createdAt: "2026-08-01T00:00:00.000Z",
  examTimeLimitSeconds: 600
};

const otherNote: NoteArtifact = { ...note, id: "note-other", materialId: otherMaterial.id };

const fakeMaterials = (store: Set<string>) => Layer.succeed(
  MaterialRepository,
  MaterialRepository.of({
    list: () => Effect.die("not used"),
    get: (id) => store.has(id) ? Effect.succeed({ ...material, id }) : Effect.fail(new MaterialNotFound({ materialId: id })),
    renderPage: () => Effect.die("not used"),
    getIndex: () => Effect.die("not used"),
    reindex: () => Effect.die("not used"),
    upload: () => Effect.die("not used"),
    validate: () => Effect.die("not used"),
    remove: (id) => store.has(id)
      ? Effect.sync(() => { store.delete(id); })
      : Effect.fail(new MaterialNotFound({ materialId: id }))
  })
);

const fakeArtifacts = (store: Artifact[]) => Layer.succeed(
  ArtifactRepository,
  ArtifactRepository.of({
    saveArtifact: () => Effect.die("not used"),
    getArtifact: () => Effect.die("not used"),
    deleteArtifact: (id) => {
      const at = store.findIndex((candidate) => candidate.id === id);
      if (at === -1) {
        return Effect.fail(new ArtifactNotFound({ artifactId: id }));
      }
      store.splice(at, 1);
      return Effect.void;
    },
    listArtifacts: () => Effect.succeed({ artifacts: store, unreadable: [] }),
    saveAttempt: () => Effect.die("not used"),
    getAttempt: () => Effect.die("not used"),
    listAttempts: () => Effect.succeed([])
  })
);

const run = (materials: Set<string>, artifacts: Artifact[], materialId: string) => Effect.runPromise(
  Effect.gen(function* () {
    const service = yield* MaterialDeletionService;
    return yield* service.remove(materialId);
  }).pipe(
    Effect.provide(MaterialDeletionServiceLive.pipe(
      Layer.provide(fakeMaterials(materials)),
      Layer.provide(fakeArtifacts(artifacts))
    ))
  )
);

test("borra el PDF y todos sus artefactos (apunte y control), sin tocar los de otro material", async () => {
  const materials = new Set([material.id, otherMaterial.id]);
  const artifacts: Artifact[] = [note, quiz, otherNote];

  await run(materials, artifacts, material.id);

  assert.equal(materials.has(material.id), false);
  assert.equal(materials.has(otherMaterial.id), true);
  assert.deepEqual(artifacts.map((artifact) => artifact.id), ["note-other"]);
});

test("un material sin artefactos se borra sin más", async () => {
  const materials = new Set([material.id]);
  const artifacts: Artifact[] = [];

  await run(materials, artifacts, material.id);

  assert.equal(materials.has(material.id), false);
});

test("MaterialNotFound si el material no existe, sin tocar artefactos de otros", async () => {
  const materials = new Set<string>();
  const artifacts: Artifact[] = [otherNote];

  await assert.rejects(
    run(materials, artifacts, material.id),
    (error: unknown) => (error as { _tag?: string })._tag === "MaterialNotFound"
  );
  assert.deepEqual(artifacts.map((artifact) => artifact.id), ["note-other"]);
});
