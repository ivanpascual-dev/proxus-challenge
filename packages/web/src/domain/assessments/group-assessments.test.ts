import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssessmentListEntry } from "@proxus/shared";
import { groupAssessments } from "./group-assessments.ts";

const entry = (partial: Partial<AssessmentListEntry> & { readonly id: string }): AssessmentListEntry => ({
  kind: "quiz",
  title: partial.id,
  mode: "practice",
  scope: { materialId: "m1", topicId: null, topicLabel: "Material entero" },
  origin: "material",
  createdAt: "2026-01-01T00:00:00.000Z",
  questionCount: 5,
  requestedQuestionCount: 5,
  examTimeLimitSeconds: 600,
  lastAttempt: null,
  ...partial
});

test("una lista vacía produce los tres grupos vacíos", () => {
  assert.deepEqual(groupAssessments([]), { controls: [], practiceExams: [], realExams: [] });
});

test("separa Controles, Exámenes de prueba y Exámenes reales conservando el orden de cada grupo", () => {
  const control1 = entry({ id: "c1", kind: "quiz" });
  const control2 = entry({ id: "c2", kind: "quiz" });
  const practiceExam = entry({ id: "e1", kind: "test", mode: "practice" });
  const realExam = entry({ id: "e2", kind: "test", mode: "exam" });

  const result = groupAssessments([control1, practiceExam, control2, realExam]);

  assert.deepEqual(result.controls, [control1, control2]);
  assert.deepEqual(result.practiceExams, [practiceExam]);
  assert.deepEqual(result.realExams, [realExam]);
});

test("el origen review viaja intacto en la entrada, sin convertirse en un cuarto grupo", () => {
  const reviewControl = entry({ id: "r1", kind: "quiz", origin: "review" });
  const result = groupAssessments([reviewControl]);
  assert.equal(result.controls.length, 1);
  assert.equal(result.controls[0]?.origin, "review");
});
