import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Stream } from "effect";
import { LanguageModel, Response } from "effect/unstable/ai";
import type { GenerateAssessmentInput, MaterialIndex } from "@proxus/shared";
import { MaterialNotFound, MaterialNotIndexed, MaterialRepository, type PdfMaterial } from "../materials/material.ts";
import { ArtifactRepository, ArtifactNotFound, type Artifact } from "./artifact.ts";
import { AssessmentGenerationService, AssessmentGenerationServiceLive } from "./assessment-generation-service.ts";

const material: PdfMaterial = {
  id: "logica",
  title: "Lógica de Primer Orden",
  fileName: "logica.pdf",
  pageCount: 3,
  uploadedAt: "2026-08-01T00:00:00.000Z",
  indexState: "indexed"
};

const index: MaterialIndex = {
  materialId: material.id,
  fileName: material.fileName,
  contentHash: "hash",
  pageCount: 3,
  indexedAt: "2026-08-01T00:00:00.000Z",
  threshold: 600,
  topics: [
    { id: "cuantificadores", label: "Cuantificadores", pages: [1, 2], parentId: null },
    { id: "sintaxis", label: "Sintaxis", pages: [3], parentId: null }
  ],
  pages: [
    { page: 1, provenance: "extracted", text: "El cuantificador universal se escribe con el símbolo para todo. ".repeat(30), denseCharacters: 900, topicIds: ["cuantificadores"] },
    { page: 2, provenance: "extracted", text: "El cuantificador existencial afirma que existe al menos un elemento. ".repeat(30), denseCharacters: 900, topicIds: ["cuantificadores"] },
    { page: 3, provenance: "extracted", text: "Una fórmula bien formada respeta las reglas de sintaxis del lenguaje. ".repeat(30), denseCharacters: 900, topicIds: ["sintaxis"] }
  ],
  failedPages: []
};

const fakeMaterials = (overrides?: Partial<MaterialRepository>) => Layer.succeed(
  MaterialRepository,
  MaterialRepository.of({
    list: () => Effect.succeed([material]),
    get: (id) => id === material.id ? Effect.succeed(material) : Effect.fail(new MaterialNotFound({ materialId: id })),
    renderPage: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
    getIndex: (id) => id === material.id ? Effect.succeed(index) : Effect.fail(new MaterialNotFound({ materialId: id })),
    reindex: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
    ...overrides
  })
);

const fakeArtifacts = (store: Artifact[]) => Layer.succeed(
  ArtifactRepository,
  ArtifactRepository.of({
    createArtifact: () => Effect.die("not used"),
    saveArtifact: (artifact) => Effect.sync(() => {
      const at = store.findIndex((candidate) => candidate.id === artifact.id);
      if (at === -1) { store.push(artifact); } else { store[at] = artifact; }
    }),
    getArtifact: (id) => {
      const found = store.find((candidate) => candidate.id === id);
      return found === undefined ? Effect.fail(new ArtifactNotFound({ artifactId: id })) : Effect.succeed(found);
    },
    deleteArtifact: () => Effect.void,
    listArtifacts: (input) => Effect.succeed({
      artifacts: input?.kind === undefined ? store : store.filter((candidate) => candidate.kind === input.kind),
      unreadable: []
    }),
    submitAttempt: () => Effect.die("not used"),
    saveAttempt: () => Effect.void,
    getAttempt: () => Effect.die("not used"),
    listAttempts: () => Effect.succeed([]),
    gradeAttempt: () => Effect.die("not used")
  })
);

const goodMultipleChoice = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "multiple-choice",
    prompt: `¿Enunciado único ${i} ${Math.random()}?`,
    options: ["Alfa", "Beta", "Gamma", "Delta"],
    correctIndex: i % 4,
    explanation: "porque la teoría lo dice",
    hint: "piensa en la definición"
  }));

const goodShortAnswer = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "short-answer",
    prompt: `Explica el concepto ${i} ${Math.random()}`,
    expectedAnswer: "una respuesta modelo",
    rubric: ["menciona la definición", "da un ejemplo"],
    explanation: "una buena respuesta toca ambos criterios",
    hint: null
  }));

const brokenShortAnswer = (n: number) =>
  Array.from({ length: n }, () => ({
    type: "short-answer",
    prompt: "Explica algo",
    expectedAnswer: "x",
    rubric: [],
    explanation: "e",
    hint: null
  }));

const countFromPrompt = (prompt: string, token: string): number => {
  const match = prompt.match(new RegExp(`- (\\d+) preguntas ${token}`));
  return match ? Number(match[1]) : 0;
};

// El modelo falso lee cuántas preguntas de cada tipo le piden y responde según la estrategia.
const fakeModel = (strategy: "good" | "half-then-good" | "always-broken" | "insufficient") => {
  let call = 0;
  return Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) => {
        call += 1;
        const prompt = JSON.stringify(options.prompt);
        const wantMc = countFromPrompt(prompt, "de opción única \\(multiple-choice\\)");
        const wantSa = countFromPrompt(prompt, "de desarrollo corto \\(short-answer\\)");

        if (strategy === "insufficient") {
          return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ insufficientContent: true, maxPossible: 2 }) })]);
        }
        if (strategy === "always-broken") {
          return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc).map((q) => ({ ...q, options: ["A", "A", "B", "C"] })), ...brokenShortAnswer(wantSa)] }) })]);
        }
        if (strategy === "half-then-good" && call === 1) {
          return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc), ...brokenShortAnswer(wantSa)] }) })]);
        }
        return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc), ...goodShortAnswer(wantSa)] }) })]);
      },
      streamText: () => Stream.empty
    })
  );
};

const generate = (
  input: GenerateAssessmentInput,
  store: Artifact[],
  strategy: Parameters<typeof fakeModel>[0],
  materialsOverride?: Partial<MaterialRepository>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* AssessmentGenerationService;
      return yield* service.forMaterial(material.id, input);
    }).pipe(
      Effect.provide(Layer.mergeAll(
        AssessmentGenerationServiceLive.pipe(
          Layer.provide(fakeArtifacts(store)),
          Layer.provide(fakeMaterials(materialsOverride))
        ),
        fakeModel(strategy)
      ))
    ) as Effect.Effect<{ artifact: Artifact; questionCount: number; retries: number }, { reason: string }>
  );

const quizInput: GenerateAssessmentInput = {
  kind: "quiz",
  topicId: "cuantificadores",
  origin: "material",
  questionCount: 6
};

test("un Control sale completo, con cada pregunta anclada a su tema y páginas", async () => {
  const store: Artifact[] = [];
  const result = await generate(quizInput, store, "good");

  assert.equal(result.artifact.kind, "quiz");
  assert.equal(result.questionCount, 6);
  assert.equal(store.length, 1);
  if (result.artifact.kind === "quiz") {
    assert.ok(result.artifact.questions.every((question) => question.source.materialId === material.id));
    assert.ok(result.artifact.questions.every((question) => question.source.topicId === "cuantificadores"));
    assert.ok(result.artifact.questions.every((question) => question.source.pages.length > 0));
    assert.deepEqual(result.artifact.questions.map((question) => question.id), ["q1", "q2", "q3", "q4", "q5", "q6"]);
    assert.equal(result.artifact.scope.topicLabel, "Cuantificadores");
  }
});

test("cuando el parseo tira preguntas, el servicio vuelve a pedir solo las que faltan y completa", async () => {
  const store: Artifact[] = [];
  const result = await generate(quizInput, store, "half-then-good");
  assert.equal(result.questionCount, 6);
  assert.ok(result.retries >= 1);
  assert.equal(store.length, 1);
});

test("si el modelo siempre devuelve preguntas rotas, la generación falla y no guarda nada", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    generate(quizInput, store, "always-broken"),
    (error: unknown) => (error as { reason?: string }).reason !== undefined
      && /no se pudieron generar/.test((error as { reason: string }).reason)
  );
  assert.equal(store.length, 0);
});

test("insufficientContent: falla nombrando cuántas preguntas sí daba el tema, sin guardar", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    generate(quizInput, store, "insufficient"),
    (error: unknown) => /solo da para 2/.test((error as { reason: string }).reason)
  );
  assert.equal(store.length, 0);
});

test("un material sin indexar falla con un motivo claro, sin crear nada", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    generate(quizInput, store, "good", { getIndex: (id) => Effect.fail(new MaterialNotIndexed({ materialId: id })) }),
    (error: unknown) => /no está indexado/.test((error as { reason: string }).reason)
  );
  assert.equal(store.length, 0);
});

test("fuera de rango: pedir 3 preguntas se rechaza nombrando el rango", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    generate({ ...quizInput, questionCount: 3 }, store, "good"),
    (error: unknown) => /entre 4 y 8/.test((error as { reason: string }).reason)
  );
});

test("la generación de repaso todavía no está disponible en este tramo", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    generate({ ...quizInput, origin: "review" }, store, "good"),
    (error: unknown) => /repaso/.test((error as { reason: string }).reason)
  );
});
