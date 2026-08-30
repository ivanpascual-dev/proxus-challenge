import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import type { MaterialIndex, TestAnswer } from "@proxus/shared";
import { MaterialNotFound, MaterialRepository, type PdfMaterial } from "../materials/material.ts";
import {
  ArtifactNotFound,
  ArtifactRepository,
  AttemptNotFound,
  type Artifact,
  type ArtifactAttempt,
  type QuestionSource,
  type QuizArtifact,
  type TestArtifact
} from "./artifact.ts";
import { AttemptService, AttemptServiceLive, toSolvable } from "./attempt-service.ts";
import { OpenAnswerJudge } from "./open-answer-judge.ts";
import { StudyProfileService } from "../profile/study-profile.ts";

const source: QuestionSource = { materialId: "m1", topicId: "t1", pages: [1], transcribed: false, unanchoredReason: null, reviewReason: null };

const quiz: QuizArtifact = {
  kind: "quiz",
  id: "quiz-1",
  title: "Control de prueba",
  scope: { materialId: "m1", topicId: "t1", topicLabel: "Tema 1" },
  origin: "material",
  createdAt: "2026-08-20T00:00:00.000Z",
  examTimeLimitSeconds: 600,
  questions: [
    { type: "multiple-choice", id: "q1", prompt: "¿1?", options: [
      { id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }, { id: "d", text: "D" }
    ], correctOptionId: "a", explanation: "es A", hint: "piensa en A", source },
    { type: "true-false", id: "q2", prompt: "¿V?", correctAnswer: true, explanation: "es V", hint: null, source },
    ...Array.from({ length: 8 }, (_, i) => ({
      type: "true-false" as const, id: `q${i + 3}`, prompt: `¿${i}?`, correctAnswer: true, explanation: "e", hint: null, source
    }))
  ]
};

// Un Examen real: modo `exam`, generado sin pistas (ADR que anula la decisión 6). El modo lo lleva el
// artefacto; el intento lo hereda.
const examReal: TestArtifact = {
  kind: "test",
  id: "test-1",
  title: "Examen real de Material",
  scope: { materialId: "m1", topicId: null, topicLabel: "Material" },
  origin: "material",
  createdAt: "2026-08-20T00:00:00.000Z",
  examTimeLimitSeconds: 600,
  mode: "exam",
  questions: [
    { type: "multiple-choice", id: "q1", prompt: "¿1?", options: [
      { id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }, { id: "d", text: "D" }
    ], correctOptionId: "a", explanation: "es A", hint: null, source },
    ...Array.from({ length: 9 }, (_, i) => ({
      type: "true-false" as const, id: `q${i + 2}`, prompt: `¿${i}?`, correctAnswer: true, explanation: "e", hint: null, source
    }))
  ]
};

const index: MaterialIndex = {
  materialId: "m1", fileName: "m1.pdf", contentHash: "h", pageCount: 2, indexedAt: "2026-08-01T00:00:00.000Z",
  threshold: 600, topics: [{ id: "t1", label: "Tema 1", pages: [1], parentId: null }],
  pages: [{ page: 1, provenance: "extracted", text: "texto del tema", denseCharacters: 20, topicIds: ["t1"] }],
  failedPages: []
};

const material: PdfMaterial = {
  id: "m1", title: "Material", fileName: "m1.pdf", pageCount: 2, uploadedAt: "2026-08-01T00:00:00.000Z", indexState: "indexed"
};

const fakeMaterials = Layer.succeed(MaterialRepository, MaterialRepository.of({
  list: () => Effect.succeed([material]),
  get: (id) => id === "m1" ? Effect.succeed(material) : Effect.fail(new MaterialNotFound({ materialId: id })),
  renderPage: (id) => Effect.fail(new MaterialNotFound({ materialId: id })),
  getIndex: (id) => id === "m1" ? Effect.succeed(index) : Effect.fail(new MaterialNotFound({ materialId: id })),
  reindex: (id) => Effect.fail(new MaterialNotFound({ materialId: id }))
}));

const fakeArtifacts = (artifacts: Artifact[], attempts: ArtifactAttempt[]) => Layer.succeed(ArtifactRepository, ArtifactRepository.of({
  createArtifact: () => Effect.die("not used"),
  saveArtifact: () => Effect.void,
  getArtifact: (id) => {
    const found = artifacts.find((a) => a.id === id);
    return found === undefined ? Effect.fail(new ArtifactNotFound({ artifactId: id })) : Effect.succeed(found);
  },
  deleteArtifact: () => Effect.void,
  listArtifacts: () => Effect.succeed({ artifacts, unreadable: [] }),
  submitAttempt: () => Effect.die("not used"),
  saveAttempt: (attempt) => Effect.sync(() => {
    const at = attempts.findIndex((a) => a.id === attempt.id);
    if (at === -1) { attempts.push(attempt); } else { attempts[at] = attempt; }
  }),
  getAttempt: (id) => {
    const found = attempts.find((a) => a.id === id);
    return found === undefined ? Effect.fail(new AttemptNotFound({ attemptId: id })) : Effect.succeed(found);
  },
  listAttempts: (artifactId) => Effect.succeed(artifactId === undefined ? attempts : attempts.filter((a) => a.artifactId === artifactId)),
  gradeAttempt: () => Effect.die("not used")
}));

// El juez falso: cumple todos los criterios.
const fakeJudge = Layer.succeed(OpenAnswerJudge, OpenAnswerJudge.of({
  grade: (questions) => Effect.succeed(questions.map((q) => ({
    questionType: "short-answer" as const,
    questionId: q.questionId,
    status: "graded" as const,
    score: q.maxScore,
    maxScore: q.maxScore,
    criteria: q.rubric.map((c) => ({ id: c.id, text: c.text, met: true })),
    unevaluatedReason: null,
    feedback: "bien"
  })))
}));

const noModel = Layer.succeed(LanguageModel.LanguageModel, LanguageModel.LanguageModel.of({} as never));

// El perfil se recalcula al entregar y al discrepar; aquí no se comprueba (tiene su propio test), así
// que el doble es inofensivo.
const fakeProfile = Layer.succeed(StudyProfileService, StudyProfileService.of({
  sync: () => Effect.succeed({ materialId: "m", topics: [], appliedAttemptIds: [], updatedAt: null }),
  read: () => Effect.succeed({ materialId: "m", topics: [], updatedAt: null })
}));

const run = <A, E>(
  effect: (service: AttemptService) => Effect.Effect<A, E, LanguageModel.LanguageModel>,
  artifacts: Artifact[],
  attempts: ArtifactAttempt[]
) => Effect.runPromise(
  Effect.gen(function* () {
    const service = yield* AttemptService;
    return yield* effect(service);
  }).pipe(
    Effect.provide(Layer.mergeAll(
      AttemptServiceLive.pipe(
        Layer.provide(fakeArtifacts(artifacts, attempts)),
        Layer.provide(fakeMaterials),
        Layer.provide(fakeJudge),
        Layer.provide(fakeProfile)
      ),
      noModel
    ))
  ) as Effect.Effect<A, E>
);

test("la proyección resoluble no lleva clave de respuesta ni pista ni explicación", () => {
  const solvable = toSolvable(quiz);
  const serialized = JSON.stringify(solvable);
  assert.doesNotMatch(serialized, /correctOptionId|correctAnswer|expectedAnswer|explanation|"hint"/);
  const first = solvable.questions[0];
  assert.equal(first?.type, "multiple-choice");
  assert.equal(first?.hasHint, true);
  assert.equal(solvable.questions[1]?.hasHint, false);
});

test("empezar cuenta contra el techo de intentos, incluidos los abandonados", async () => {
  const attempts: ArtifactAttempt[] = [];
  // Solo se puede tener uno abierto a la vez: se abandona cada uno antes de empezar el siguiente.
  for (let i = 0; i < 3; i += 1) {
    const started = await run((s) => s.start("quiz-1"), [quiz], attempts);
    await run((s) => s.abandon(started.id, "cancelled"), [quiz], attempts);
  }
  await assert.rejects(
    run((s) => s.start("quiz-1"), [quiz], attempts),
    (e: unknown) => (e as { _tag?: string })._tag === "AttemptLimitExceeded"
  );
});

test("empezar de nuevo la misma prueba retoma el intento a medias, no crea otro", async () => {
  const attempts: ArtifactAttempt[] = [];
  const first = await run((s) => s.start("quiz-1"), [quiz], attempts);
  const again = await run((s) => s.start("quiz-1"), [quiz], attempts);
  assert.equal(again.id, first.id);
  assert.equal(attempts.filter((a) => a.status === "in-progress").length, 1);
});

test("no se puede empezar un intento de otra prueba con uno a medias", async () => {
  const attempts: ArtifactAttempt[] = [];
  await run((s) => s.start("quiz-1"), [quiz, examReal], attempts);
  await assert.rejects(
    run((s) => s.start("test-1"), [quiz, examReal], attempts),
    (e: unknown) => (e as { _tag?: string })._tag === "AttemptInProgress"
  );
});

test("el intento hereda el modo del artefacto: el Examen real es modo examen", async () => {
  const attempts: ArtifactAttempt[] = [];
  const started = await run((s) => s.start("test-1"), [examReal], attempts);
  assert.equal(started.mode, "exam");
  assert.equal(started.timeLimitSeconds, 600);
});

test("entregar 2 respuestas de 10 preguntas da 2/10, no 2/2 (regresión del bug de §3)", async () => {
  const attempts: ArtifactAttempt[] = [];
  const started = await run((s) => s.start("quiz-1"), [quiz], attempts);
  const answers: readonly TestAnswer[] = [
    { questionType: "multiple-choice", questionId: "q1", selectedOptionId: "a" },
    { questionType: "true-false", questionId: "q2", answer: true }
  ];
  const graded = await run((s) => s.submit("quiz-1", started.id, answers), [quiz], attempts);
  assert.equal(graded.status, "graded");
  assert.equal(graded.rawScore, 2);
  assert.equal(graded.maxScore, 10);
});

test("una pista en examen se rechaza en el código", async () => {
  const attempts: ArtifactAttempt[] = [];
  const started = await run((s) => s.start("test-1"), [examReal], attempts);
  await assert.rejects(
    run((s) => s.revealHint("test-1", started.id, "q1"), [examReal], attempts),
    (e: unknown) => (e as { _tag?: string })._tag === "HintNotAvailable"
  );
});

test("una pista en práctica se registra en hintsRevealed y devuelve el texto", async () => {
  const attempts: ArtifactAttempt[] = [];
  const started = await run((s) => s.start("quiz-1"), [quiz], attempts);
  const result = await run((s) => s.revealHint("quiz-1", started.id, "q1"), [quiz], attempts);
  assert.equal(result.hint, "piensa en A");
  const stored = attempts.find((a) => a.id === started.id);
  assert.deepEqual(stored?.hintsRevealed, ["q1"]);
});

test("abandonar deja el intento como abandoned con su motivo, sin corregir", async () => {
  const attempts: ArtifactAttempt[] = [];
  const started = await run((s) => s.start("quiz-1"), [quiz], attempts);
  const abandoned = await run((s) => s.abandon(started.id, "cancelled"), [quiz], attempts);
  assert.equal(abandoned.status, "abandoned");
  assert.equal(abandoned.status === "abandoned" ? abandoned.reason : null, "cancelled");
});
