import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer, Option, Stream } from "effect";
import { LanguageModel, Response } from "effect/unstable/ai";
import type { GenerateAssessmentInput, MaterialIndex } from "@proxus/shared";
import { MaterialNotFound, MaterialNotIndexed, MaterialRepository, type PdfMaterial } from "../materials/material.ts";
import { ArtifactRepository, ArtifactNotFound, type Artifact } from "./artifact.ts";
import { AssessmentGenerationService, AssessmentGenerationServiceLive } from "./assessment-generation-service.ts";
import { StudyProfileService } from "../profile/study-profile.ts";
import type { StudyProfile } from "@proxus/shared";

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
    saveAttempt: () => Effect.void,
    getAttempt: () => Effect.die("not used"),
    listAttempts: () => Effect.succeed([])
  })
);

// El perfil de estudio falso: por defecto vacío (una generación de material no lo necesita). Para el
// repaso se le pasan señales por tema.
const fakeProfile = (topics: StudyProfile["topics"] = []) => Layer.succeed(
  StudyProfileService,
  StudyProfileService.of({
    sync: () => Effect.succeed({ materialId: material.id, topics: [], appliedAttemptIds: [], updatedAt: null }),
    read: () => Effect.succeed({ materialId: material.id, topics, updatedAt: null })
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

const goodMultipleResponse = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "multiple-response",
    prompt: `¿Cuáles valen para el caso ${i} ${Math.random()}?`,
    options: ["Alfa", "Beta", "Gamma", "Delta"],
    correctIndexes: [0, 2],
    explanation: "porque la teoría lo dice",
    hint: "descarta las imposibles"
  }));

const goodTrueFalse = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "true-false",
    prompt: `El enunciado ${i} ${Math.random()} es cierto.`,
    correctAnswer: i % 2 === 0,
    explanation: "porque la teoría lo dice",
    hint: "vuelve a la definición"
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
        const wantMr = countFromPrompt(prompt, "de opción múltiple \\(multiple-response\\)");
        const wantTf = countFromPrompt(prompt, "de verdadero/falso \\(true-false\\)");
        const wantSa = countFromPrompt(prompt, "de desarrollo corto \\(short-answer\\)");
        const rest = () => [...goodMultipleResponse(wantMr), ...goodTrueFalse(wantTf)];

        if (strategy === "insufficient") {
          return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ insufficientContent: true, maxPossible: 2 }) })]);
        }
        if (strategy === "always-broken") {
          return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc).map((q) => ({ ...q, options: ["A", "A", "B", "C"] })), ...brokenShortAnswer(wantSa)] }) })]);
        }
        if (strategy === "half-then-good" && call === 1) {
          return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc), ...rest(), ...brokenShortAnswer(wantSa)] }) })]);
        }
        return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc), ...rest(), ...goodShortAnswer(wantSa)] }) })]);
      },
      streamText: () => Stream.empty
    })
  );
};

const generate = (
  input: GenerateAssessmentInput,
  store: Artifact[],
  strategy: Parameters<typeof fakeModel>[0],
  materialsOverride?: Partial<MaterialRepository>,
  profileTopics?: StudyProfile["topics"]
) => generateWithModel(input, store, fakeModel(strategy), materialsOverride, profileTopics);

const generateWithModel = (
  input: GenerateAssessmentInput,
  store: Artifact[],
  modelLayer: Layer.Layer<LanguageModel.LanguageModel>,
  materialsOverride?: Partial<MaterialRepository>,
  profileTopics?: StudyProfile["topics"]
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* AssessmentGenerationService;
      return yield* service.forMaterial(material.id, input);
    }).pipe(
      Effect.provide(Layer.mergeAll(
        AssessmentGenerationServiceLive.pipe(
          Layer.provide(fakeArtifacts(store)),
          Layer.provide(fakeMaterials(materialsOverride)),
          Layer.provide(fakeProfile(profileTopics))
        ),
        modelLayer
      ))
    ) as Effect.Effect<{ artifact: Artifact; questionCount: number; retries: number }, { reason: string }>
  );

// Un modelo que siempre devuelve los mismos enunciados fijos. Sirve para probar que un Control nuevo
// no puede repetir las preguntas de uno anterior.
const fixedPromptModel = () => Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) => {
      const prompt = JSON.stringify(options.prompt);
      const wantMc = countFromPrompt(prompt, "de opción única \\(multiple-choice\\)");
      const wantSa = countFromPrompt(prompt, "de desarrollo corto \\(short-answer\\)");
      const questions = [
        ...Array.from({ length: wantMc }, (_, i) => ({
          type: "multiple-choice",
          prompt: `Pregunta fija de opción única número ${i}`,
          options: ["Alfa", "Beta", "Gamma", "Delta"],
          correctIndex: 0,
          explanation: "porque sí",
          hint: null
        })),
        ...Array.from({ length: wantSa }, (_, i) => ({
          type: "short-answer",
          prompt: `Pregunta fija de desarrollo número ${i}`,
          expectedAnswer: "una respuesta modelo",
          rubric: ["menciona la definición"],
          explanation: "toca el criterio",
          hint: null
        }))
      ];
      return Effect.succeed([Response.makePart("text", { text: JSON.stringify({ questions }) })]);
    },
    streamText: () => Stream.empty
  })
);

// Captura los prompts que ve el modelo y responde bien, con enunciados nuevos cada vez.
const capturingModel = (seen: string[]) => Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) => {
      const prompt = JSON.stringify(options.prompt);
      seen.push(prompt);
      const wantMc = countFromPrompt(prompt, "de opción única \\(multiple-choice\\)");
      const wantSa = countFromPrompt(prompt, "de desarrollo corto \\(short-answer\\)");
      return Effect.succeed([Response.makePart("text", {
        text: JSON.stringify({ questions: [...goodMultipleChoice(wantMc), ...goodShortAnswer(wantSa)] })
      })]);
    },
    streamText: () => Stream.empty
  })
);

const quizInput: GenerateAssessmentInput = {
  kind: "quiz",
  topicId: "cuantificadores",
  origin: "material",
  questionCount: 6,
  mode: "practice"
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

const testInput: GenerateAssessmentInput = {
  kind: "test",
  topicId: null,
  origin: "material",
  questionCount: 10,
  mode: "practice"
};

test("el Examen real se genera sin pistas (ADR-018); el de prueba las conserva", async () => {
  const realStore: Artifact[] = [];
  const real = await generate({ ...testInput, mode: "exam" }, realStore, "good");
  assert.equal(real.artifact.kind, "test");
  if (real.artifact.kind === "test") {
    assert.equal(real.artifact.mode, "exam");
    assert.ok(real.artifact.questions.every((question) => question.hint === null));
  }

  const practiceStore: Artifact[] = [];
  const practice = await generate(testInput, practiceStore, "good");
  if (practice.artifact.kind === "test") {
    assert.ok(practice.artifact.questions.some((question) => question.hint !== null));
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

test("fuera de rango: pedir 3 preguntas se rechaza en el precheck (400), nombrando el rango", async () => {
  const rejection = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* AssessmentGenerationService;
      return yield* service.precheck(material.id, { ...quizInput, questionCount: 3 });
    }).pipe(
      Effect.provide(AssessmentGenerationServiceLive.pipe(
        Layer.provide(fakeArtifacts([])),
        Layer.provide(fakeMaterials()),
        Layer.provide(fakeProfile())
      ))
    )
  );

  assert.equal(Option.isSome(rejection), true);
  const value = Option.getOrThrow(rejection);
  assert.equal(value.status, 400);
  assert.match(value.message, /entre 4 y 8/);
});

test("si un segundo Control del mismo tema saldría idéntico pregunta por pregunta, la generación falla", async () => {
  const store: Artifact[] = [];
  const first = await generateWithModel(quizInput, store, fixedPromptModel());
  assert.equal(store.length, 1);
  const firstPrompts = first.artifact.kind === "quiz" ? first.artifact.questions.map((question) => question.prompt) : [];

  // El modelo insiste en los mismos seis enunciados: el conjunto entero coincide con la prueba
  // anterior y la generación falla sin guardar un segundo Control.
  await assert.rejects(
    generateWithModel(quizInput, store, fixedPromptModel()),
    (error: unknown) => /mismas preguntas/.test((error as { reason: string }).reason)
  );
  assert.equal(store.length, 1);
  assert.deepEqual(
    (store[0]?.kind === "quiz" ? store[0].questions.map((question) => question.prompt) : []),
    firstPrompts
  );
});

test("un segundo Control con preguntas distintas se guarda con las 6, y el modelo ve los enunciados anteriores", async () => {
  const store: Artifact[] = [];
  await generateWithModel(quizInput, store, fixedPromptModel());

  const seen: string[] = [];
  const second = await generateWithModel(quizInput, store, capturingModel(seen));

  assert.equal(store.length, 2);
  assert.equal(second.questionCount, 6);
  // El primer control usó enunciados "Pregunta fija ... número N": deben aparecer en el prompt del
  // segundo como referencia para variar.
  assert.ok(seen.some((prompt) => prompt.includes("Pregunta fija de opción única número 0")));
});

test("un repaso concentra las preguntas en el tema con señal y les pone el motivo", async () => {
  const store: Artifact[] = [];
  const result = await generate(
    { ...testInput, origin: "review", questionCount: 10 },
    store,
    "good",
    undefined,
    [
      { topicId: "cuantificadores", topicLabel: "Cuantificadores", correct: 0, incorrect: 3, unevaluated: 0, blank: 0, hintsRevealed: 0, emphasis: false },
      { topicId: "sintaxis", topicLabel: "Sintaxis", correct: 5, incorrect: 0, unevaluated: 0, blank: 0, hintsRevealed: 0, emphasis: false }
    ]
  );

  if (result.artifact.kind === "test") {
    assert.equal(result.artifact.origin, "review");
    // Todo el peso está en "cuantificadores" (sintaxis no tiene fallos ni pistas ni marca).
    assert.ok(result.artifact.questions.every((question) => question.source.topicId === "cuantificadores"));
    assert.ok(result.artifact.questions.every((question) => question.source.reviewReason === "fallada"));
  }
});

test("un repaso sin nada que repasar en el alcance falla diciéndolo, sin guardar", async () => {
  const store: Artifact[] = [];
  await assert.rejects(
    generate({ ...quizInput, origin: "review" }, store, "good", undefined, []),
    (error: unknown) => /nada que repasar/.test((error as { reason: string }).reason)
  );
  assert.equal(store.length, 0);
});

test("una prueba de material deja reviewReason a null en cada pregunta", async () => {
  const store: Artifact[] = [];
  const result = await generate(quizInput, store, "good");
  if (result.artifact.kind === "quiz") {
    assert.ok(result.artifact.questions.every((question) => question.source.reviewReason === null));
  }
});
