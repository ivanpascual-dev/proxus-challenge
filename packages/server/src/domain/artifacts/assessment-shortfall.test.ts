import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuizArtifact } from "./artifact.ts";
import type { QuestionHole } from "./assessment-shape.ts";
import { assessmentShortfall, holesWithinCapacity, requestedQuestionCount } from "./assessment-shortfall.ts";

const baseArtifact = (overrides: Partial<QuizArtifact> = {}): QuizArtifact => ({
  kind: "quiz",
  id: "quiz-1",
  title: "Control",
  questions: [],
  scope: { materialId: "m1", topicId: "t1", topicLabel: "Tema" },
  origin: "material",
  createdAt: "2026-08-01T00:00:00.000Z",
  examTimeLimitSeconds: 300,
  ...overrides
});

const question = (id: string) => ({
  type: "true-false" as const,
  id,
  prompt: `¿Pregunta ${id}?`,
  correctAnswer: true,
  explanation: "e",
  hint: null,
  source: { materialId: "m1", topicId: "t1", pages: [1], transcribed: false, unanchoredReason: null, reviewReason: null }
});

test("requestedQuestionCount: un artefacto antiguo sin el campo se interpreta como completo", () => {
  const artifact = baseArtifact({ questions: [question("q1"), question("q2")] });
  assert.equal(requestedQuestionCount(artifact), 2);
});

test("requestedQuestionCount: usa el campo persistido cuando existe", () => {
  const artifact = baseArtifact({ questions: [question("q1")], requestedQuestionCount: 6 });
  assert.equal(requestedQuestionCount(artifact), 6);
});

test("assessmentShortfall: null cuando solicitado y real coinciden", () => {
  const artifact = baseArtifact({ questions: [question("q1")], requestedQuestionCount: 1 });
  assert.equal(assessmentShortfall(artifact), null);
});

test("assessmentShortfall: los dos números de una prueba parcial", () => {
  const artifact = baseArtifact({ questions: [question("q1"), question("q2")], requestedQuestionCount: 6 });
  assert.deepEqual(assessmentShortfall(artifact), { requested: 6, generated: 2 });
});

test("assessmentShortfall: un artefacto antiguo (sin el campo) nunca es parcial", () => {
  const artifact = baseArtifact({ questions: [question("q1"), question("q2")] });
  assert.equal(assessmentShortfall(artifact), null);
});

const hole = (topicId: string, questionType: QuestionHole["questionType"]): QuestionHole => ({
  topicId,
  questionType,
  reason: "nueva"
});

test("holesWithinCapacity: toma los primeros N huecos, en orden", () => {
  const holes = [hole("t1", "multiple-choice"), hole("t1", "multiple-choice"), hole("t1", "short-answer")];
  assert.deepEqual(holesWithinCapacity(holes, 2), holes.slice(0, 2));
});

test("holesWithinCapacity: cero o negativo deja la lista vacía", () => {
  const holes = [hole("t1", "multiple-choice")];
  assert.deepEqual(holesWithinCapacity(holes, 0), []);
  assert.deepEqual(holesWithinCapacity(holes, -3), []);
});

test("holesWithinCapacity: un máximo mayor que la lista la deja intacta", () => {
  const holes = [hole("t1", "multiple-choice")];
  assert.deepEqual(holesWithinCapacity(holes, 10), holes);
});
