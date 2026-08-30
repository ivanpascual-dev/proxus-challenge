import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  GradedAttempt,
  QuestionCorrection,
  QuestionSource,
  TestArtifact,
  TestQuestion
} from "../artifacts/artifact.ts";
import { applyAttempt, emptyProfile, rebuildProfile } from "./profile-update.ts";

const NOW = "2026-08-30T12:00:00.000Z";

const source = (topicId: string): QuestionSource => ({
  materialId: "m1",
  topicId,
  pages: [1],
  transcribed: false,
  unanchoredReason: null,
  reviewReason: null
});

// Una prueba mínima: solo importan `id` y `source.topicId` de cada pregunta para el perfil. Un
// Examen acepta los cuatro tipos, así que sirve de andamio para todos los casos.
const artifact = (
  questions: readonly { id: string; topicId: string }[],
  overrideQuestions?: readonly TestQuestion[]
): TestArtifact => ({
  kind: "test",
  id: "quiz-1",
  title: "Prueba",
  scope: { materialId: "m1", topicId: null, topicLabel: "Material" },
  origin: "material",
  createdAt: NOW,
  examTimeLimitSeconds: 0,
  mode: "practice",
  questions: overrideQuestions ?? questions.map((q): TestQuestion => ({
    type: "true-false",
    id: q.id,
    prompt: "¿?",
    correctAnswer: true,
    explanation: "",
    hint: null,
    source: source(q.topicId)
  }))
});

const graded = (
  corrections: readonly QuestionCorrection[],
  overrides: Partial<GradedAttempt> = {}
): GradedAttempt => ({
  id: "att-1",
  artifactId: "quiz-1",
  artifactKind: "test",
  mode: "practice",
  status: "graded",
  startedAt: NOW,
  timeLimitSeconds: null,
  hintsRevealed: [],
  answers: [],
  connectedSeconds: 0,
  lastHeartbeatAt: null,
  interruptions: [],
  submittedAt: NOW,
  elapsedSeconds: 0,
  corrections,
  rawScore: 0,
  maxScore: 0,
  penalty: 0,
  displayedScore: 0,
  summary: "",
  ...overrides
});

const tfCorrection = (questionId: string, correct: boolean): QuestionCorrection => ({
  questionType: "true-false",
  questionId,
  correct,
  answer: true,
  correctAnswer: true,
  explanation: ""
});

const topic = (profile: ReturnType<typeof emptyProfile>, topicId: string) =>
  profile.topics.find((candidate) => candidate.topicId === topicId);

test("única respuesta / verdadero-falso: acierto suma correct, fallo suma incorrect", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }, { id: "q2", topicId: "t1" }]);
  const profile = applyAttempt(
    emptyProfile("m1"),
    art,
    graded([tfCorrection("q1", true), tfCorrection("q2", false)]),
    NOW
  );
  assert.equal(topic(profile, "t1")?.correct, 1);
  assert.equal(topic(profile, "t1")?.incorrect, 1);
});

test("múltiple respuesta mueve el perfil por fullyCorrect, no por score", () => {
  const art = artifact([], [{
    type: "multiple-response",
    id: "q1",
    prompt: "¿?",
    options: [{ id: "a", text: "a" }, { id: "b", text: "b" }, { id: "c", text: "c" }, { id: "d", text: "d" }],
    correctOptionIds: ["a", "b"],
    explanation: "",
    hint: null,
    source: source("t1")
  }]);
  const parcial: QuestionCorrection = {
    questionType: "multiple-response",
    questionId: "q1",
    selectedOptionIds: ["a"],
    correctOptionIds: ["a", "b"],
    score: 0.5,
    maxScore: 1,
    fullyCorrect: false,
    explanation: ""
  };
  const profile = applyAttempt(emptyProfile("m1"), art, graded([parcial]), NOW);
  // 0.5 de nota mostrada, pero el perfil lo cuenta como fallo: todo o nada (decisión 13).
  assert.equal(topic(profile, "t1")?.incorrect, 1);
  assert.equal(topic(profile, "t1")?.correct, 0);
});

test("desarrollo corto: graded con todos los criterios cumplidos es acierto; con alguno sin cumplir, fallo", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }, { id: "q2", topicId: "t1" }]);
  const full: QuestionCorrection = {
    questionType: "short-answer",
    questionId: "q1",
    status: "graded",
    score: 2,
    maxScore: 2,
    criteria: [{ id: "c1", text: "", met: true }, { id: "c2", text: "", met: true }],
    unevaluatedReason: null,
    feedback: ""
  };
  const partial: QuestionCorrection = {
    questionType: "short-answer",
    questionId: "q2",
    status: "graded",
    score: 1,
    maxScore: 2,
    criteria: [{ id: "c1", text: "", met: true }, { id: "c2", text: "", met: false }],
    unevaluatedReason: null,
    feedback: ""
  };
  const profile = applyAttempt(emptyProfile("m1"), art, graded([full, partial]), NOW);
  assert.equal(topic(profile, "t1")?.correct, 1);
  assert.equal(topic(profile, "t1")?.incorrect, 1);
});

test("desarrollo corto unevaluated o disputed suma unevaluated y nada más", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }, { id: "q2", topicId: "t1" }]);
  const unevaluated: QuestionCorrection = {
    questionType: "short-answer",
    questionId: "q1",
    status: "unevaluated",
    score: null,
    maxScore: 2,
    criteria: [],
    unevaluatedReason: "el juez se cayó",
    feedback: ""
  };
  const disputed: QuestionCorrection = {
    questionType: "short-answer",
    questionId: "q2",
    status: "disputed",
    score: null,
    maxScore: 2,
    criteria: [{ id: "c1", text: "", met: false }],
    unevaluatedReason: null,
    feedback: ""
  };
  const profile = applyAttempt(emptyProfile("m1"), art, graded([unevaluated, disputed]), NOW);
  assert.equal(topic(profile, "t1")?.unevaluated, 2);
  assert.equal(topic(profile, "t1")?.correct, 0);
  assert.equal(topic(profile, "t1")?.incorrect, 0);
});

test("una pregunta en blanco suma blank, no incorrect", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }]);
  const blank: QuestionCorrection = {
    questionType: "blank",
    questionId: "q1",
    maxScore: 1,
    explanation: ""
  };
  const profile = applyAttempt(emptyProfile("m1"), art, graded([blank]), NOW);
  assert.equal(topic(profile, "t1")?.blank, 1);
  assert.equal(topic(profile, "t1")?.incorrect, 0);
});

test("un acierto con pista suma acierto y pista, no fallo", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }]);
  const profile = applyAttempt(
    emptyProfile("m1"),
    art,
    graded([tfCorrection("q1", true)], { hintsRevealed: ["q1"] }),
    NOW
  );
  assert.equal(topic(profile, "t1")?.correct, 1);
  assert.equal(topic(profile, "t1")?.hintsRevealed, 1);
  assert.equal(topic(profile, "t1")?.incorrect, 0);
});

test("el mismo intento aplicado dos veces no mueve nada (idempotente por id)", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }]);
  const once = applyAttempt(emptyProfile("m1"), art, graded([tfCorrection("q1", false)]), NOW);
  const twice = applyAttempt(once, art, graded([tfCorrection("q1", false)]), "2026-08-30T13:00:00.000Z");
  assert.deepEqual(twice, once);
  assert.equal(topic(twice, "t1")?.incorrect, 1);
});

test("la penalización del examen no entra en el perfil", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }]);
  const profile = applyAttempt(
    emptyProfile("m1"),
    art,
    graded([tfCorrection("q1", true)], { mode: "exam", penalty: 3, displayedScore: 0 }),
    NOW
  );
  // El perfil solo ve el acierto; la penalización (3) no aparece en ningún contador.
  assert.equal(topic(profile, "t1")?.correct, 1);
  assert.equal(topic(profile, "t1")?.incorrect, 0);
});

test("ningún campo del tema es la suma de dos señales: la forma del objeto lo garantiza", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }]);
  const profile = applyAttempt(
    emptyProfile("m1"),
    art,
    graded([tfCorrection("q1", false)], { hintsRevealed: ["q1"] }),
    NOW
  );
  assert.deepEqual(
    Object.keys(topic(profile, "t1") ?? {}).sort(),
    ["blank", "correct", "hintsRevealed", "incorrect", "topicId", "unevaluated"]
  );
  // Fallo + pista: incorrect 1 y hintsRevealed 1, en cajas distintas.
  assert.equal(topic(profile, "t1")?.incorrect, 1);
  assert.equal(topic(profile, "t1")?.hintsRevealed, 1);
});

test("rebuildProfile es una reducción determinista sobre los intentos, en orden", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }, { id: "q2", topicId: "t2" }]);
  const entries = [
    { artifact: art, attempt: graded([tfCorrection("q1", false)], { id: "a1" }) },
    { artifact: art, attempt: graded([tfCorrection("q1", false), tfCorrection("q2", true)], { id: "a2" }) }
  ];
  const profile = rebuildProfile("m1", entries, NOW);
  assert.equal(topic(profile, "t1")?.incorrect, 2);
  assert.equal(topic(profile, "t2")?.correct, 1);
  assert.deepEqual(profile.appliedAttemptIds, ["a1", "a2"]);
  // Recalcular de nuevo da exactamente lo mismo.
  assert.deepEqual(rebuildProfile("m1", entries, NOW), profile);
});

test("una corrección de una pregunta que no está en la prueba se ignora, no rompe", () => {
  const art = artifact([{ id: "q1", topicId: "t1" }]);
  const profile = applyAttempt(
    emptyProfile("m1"),
    art,
    graded([tfCorrection("q1", true), tfCorrection("fantasma", false)]),
    NOW
  );
  assert.equal(topic(profile, "t1")?.correct, 1);
  assert.equal(profile.topics.length, 1);
});
