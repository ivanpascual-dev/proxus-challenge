import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit } from "effect";
import type { ChatContextRef } from "@proxus/shared";
import { ArtifactNotFound, ArtifactRepository, type Artifact } from "../../artifacts/artifact.ts";
import { MaterialNotFound, MaterialRepository, type PdfMaterial } from "../../materials/material.ts";
import { renderScreenContext } from "../harness/index.ts";
import { resolveScreenContext } from "./screen-context-resolver.ts";

// --- fakes ---------------------------------------------------------------

const calculo: PdfMaterial = {
  id: "calculo",
  title: "Cálculo I",
  fileName: "calculo.pdf",
  pageCount: 12,
  uploadedAt: "2026-08-01T00:00:00.000Z",
  indexState: "indexed"
};

const algebra: PdfMaterial = { ...calculo, id: "algebra", title: "Álgebra", fileName: "algebra.pdf" };

// Los títulos son deliberadamente ambiguos: es lo que demuestra que el tipo y el modo salen del
// artefacto y no del copy (§6.4).
const control: Artifact = {
  kind: "quiz",
  id: "q1",
  title: "Examen final de derivadas",
  questions: [],
  scope: { materialId: "calculo", topicId: "derivadas", topicLabel: "Derivadas" },
  origin: "material",
  createdAt: "2026-08-02T00:00:00.000Z",
  examTimeLimitSeconds: 600
};

const examenDePrueba: Artifact = {
  kind: "test",
  id: "t1",
  title: "Control rápido",
  questions: [],
  scope: { materialId: "calculo", topicId: null, topicLabel: "Cálculo I" },
  origin: "material",
  createdAt: "2026-08-02T00:00:00.000Z",
  examTimeLimitSeconds: 1800,
  mode: "practice"
};

const examenReal: Artifact = { ...examenDePrueba, id: "t2", title: "Repaso suave", mode: "exam" };

type NoteArtifact = Extract<Artifact, { readonly kind: "note" }>;

const apunte: NoteArtifact = {
  kind: "note",
  id: "n1",
  title: "Apuntes de Cálculo I",
  materialId: "calculo",
  blocks: [
    {
      id: "b1",
      markdown: "## La derivada\n\nEs el límite del cociente incremental.",
      author: "tutor",
      emphasis: false,
      source: null
    }
  ],
  proposals: []
};

const apunteDeOtroMaterial: NoteArtifact = { ...apunte, id: "n2", materialId: "algebra" };

const materials = MaterialRepository.of({
  list: () => Effect.succeed([calculo, algebra]),
  get: (id) => {
    const found = [calculo, algebra].find((material) => material.id === id);
    return found === undefined ? Effect.fail(new MaterialNotFound({ materialId: id })) : Effect.succeed(found);
  },
  renderPage: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
  getIndex: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
  reindex: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
  upload: () => Effect.die("stub"),
  validate: () => Effect.die("stub"),
  remove: () => Effect.die("stub")
});

const artifacts = ArtifactRepository.of({
  saveArtifact: () => Effect.void,
  getArtifact: (id) => {
    const found = [control, examenDePrueba, examenReal, apunte, apunteDeOtroMaterial]
      .find((artifact) => artifact.id === id);
    return found === undefined ? Effect.fail(new ArtifactNotFound({ artifactId: id })) : Effect.succeed(found);
  },
  deleteArtifact: () => Effect.void,
  listArtifacts: () => Effect.succeed({ artifacts: [], unreadable: [] }),
  saveAttempt: () => Effect.void,
  getAttempt: () => Effect.die("stub"),
  listAttempts: () => Effect.succeed([]),
  deleteAttempt: () => Effect.die("stub")
});

const resolve = (refs: readonly ChatContextRef[]) =>
  Effect.runPromise(resolveScreenContext(refs, materials, artifacts));

const rejection = async (refs: readonly ChatContextRef[]): Promise<string> => {
  const exit = await Effect.runPromiseExit(resolveScreenContext(refs, materials, artifacts));
  assert.equal(Exit.isFailure(exit), true, "se esperaba un rechazo del contexto de pantalla");
  const error = Cause.squash((exit as Exit.Failure<never, unknown>).cause) as {
    readonly _tag?: string;
    readonly message?: string;
  };
  assert.equal(error._tag, "InvalidScreenContext");
  return error.message ?? "";
};

const material = (surface: "pdf" | "mindmap" | "notes" | "assessments"): ChatContextRef =>
  ({ type: "material", materialId: "calculo", title: "lo que diga el navegador", surface });

// --- material y superficie -----------------------------------------------

test("el material se describe con el título del repositorio, no con el que mandó el cliente", async () => {
  const resolved = await resolve([material("mindmap")]);

  assert.deepEqual(resolved, [
    { kind: "material", materialId: "calculo", title: "Cálculo I", surface: "mindmap" }
  ]);
});

test("un material que ya no existe se rechaza en voz alta", async () => {
  const message = await rejection([
    { type: "material", materialId: "borrado", title: "Borrado", surface: "pdf" }
  ]);

  assert.match(message, /borrado/);
});

// --- página (F5-40) -------------------------------------------------------

test("una página dentro del rango se describe con el material real", async () => {
  const resolved = await resolve([
    material("pdf"),
    { type: "page", materialId: "calculo", page: 7, title: "Cálculo I" }
  ]);

  assert.deepEqual(resolved[1], {
    kind: "page",
    materialId: "calculo",
    materialTitle: "Cálculo I",
    page: 7
  });
});

test("una página fuera del rango del material se rechaza y dice cuántas hay", async () => {
  const message = await rejection([
    material("pdf"),
    { type: "page", materialId: "calculo", page: 99, title: "Cálculo I" }
  ]);

  assert.match(message, /99/);
  assert.match(message, /12 páginas/);
});

test("una página de otro material que el que está abierto se rechaza", async () => {
  const message = await rejection([
    material("pdf"),
    { type: "page", materialId: "algebra", page: 2, title: "Álgebra" }
  ]);

  assert.match(message, /algebra/);
});

// --- prueba abierta (F5-44) ----------------------------------------------

test("el tipo de la prueba sale del artefacto, no de su título", async () => {
  const resolvedControl = await resolve([
    material("assessments"),
    { type: "assessment", artifactId: "q1", title: "Examen final de derivadas", view: "solve" }
  ]);
  const resolvedExamen = await resolve([
    material("assessments"),
    { type: "assessment", artifactId: "t1", title: "Control rápido", view: "history" }
  ]);

  assert.deepEqual(resolvedControl[1], {
    kind: "assessment",
    artifactId: "q1",
    title: "Examen final de derivadas",
    assessment: "Control",
    view: "solve"
  });
  assert.equal(resolvedExamen[1]?.kind === "assessment" ? resolvedExamen[1].assessment : null, "Examen de prueba");
});

test("un Examen real solo se puede mirar en su historial, y se nombra como lo que es", async () => {
  const resolved = await resolve([
    material("assessments"),
    { type: "assessment", artifactId: "t2", title: "Repaso suave", view: "history" }
  ]);

  assert.equal(resolved[1]?.kind === "assessment" ? resolved[1].assessment : null, "Examen real");
});

test("un artifactId que apunta a un apunte no puede pasar por prueba", async () => {
  const message = await rejection([
    material("assessments"),
    { type: "assessment", artifactId: "n1", title: "Apuntes de Cálculo I", view: "solve" }
  ]);

  assert.match(message, /apunte/);
});

test("una prueba de otro material que el que está abierto se rechaza", async () => {
  const message = await rejection([
    { type: "material", materialId: "algebra", title: "Álgebra", surface: "assessments" },
    { type: "assessment", artifactId: "q1", title: "Examen final de derivadas", view: "solve" }
  ]);

  assert.match(message, /calculo/);
});

test("una prueba inexistente se rechaza", async () => {
  const message = await rejection([
    material("assessments"),
    { type: "assessment", artifactId: "fantasma", title: "Fantasma", view: "solve" }
  ]);

  assert.match(message, /fantasma/);
});

// --- apunte y bloque ------------------------------------------------------

test("el apunte abierto se describe como apunte y el bloque con su encabezado real", async () => {
  const resolved = await resolve([
    material("notes"),
    { type: "artifact", artifactId: "n1", title: "Apuntes de Cálculo I" },
    { type: "block", artifactId: "n1", blockId: "b1", title: "lo que diga el navegador" }
  ]);

  assert.deepEqual(resolved[1], { kind: "note", artifactId: "n1", title: "Apuntes de Cálculo I" });
  assert.deepEqual(resolved[2], {
    kind: "block",
    artifactId: "n1",
    blockId: "b1",
    title: "La derivada"
  });
});

test("un bloque que ya no está en el apunte se rechaza", async () => {
  const message = await rejection([
    material("notes"),
    { type: "block", artifactId: "n1", blockId: "borrado", title: "Borrado" }
  ]);

  assert.match(message, /borrado/);
});

test("un apunte de otro material que el que está abierto se rechaza", async () => {
  const message = await rejection([
    material("notes"),
    { type: "artifact", artifactId: "n2", title: "Apuntes de Álgebra" }
  ]);

  assert.match(message, /algebra/);
});

// --- lo que llega al prompt ----------------------------------------------

// La cadena completa: lo que Sym lee de una pantalla de Pruebas con un Control abierto.
test("el bloque que llega al modelo nombra pestaña, prueba y vista, y nada más", async () => {
  const resolved = await resolve([
    material("assessments"),
    { type: "assessment", artifactId: "q1", title: "Examen final de derivadas", view: "solve" }
  ]);
  const block = renderScreenContext(resolved) ?? "";

  assert.match(block, /material "Cálculo I" \(id: calculo\), on the "Pruebas" tab/);
  assert.match(block, /Control "Examen final de derivadas" \(id: q1\), open in its solver/);
  assert.ok(!block.includes("intento"), block);
});
