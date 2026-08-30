import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import type { MultipleChoiceCorrection, QuestionCorrection, QuestionSource, TestQuestion } from "./artifact.ts";
import { displayedScore, penalty, timeLimitSeconds } from "./exam-scoring.ts";

const source: QuestionSource = { materialId: "m1", topicId: "t1", pages: [1], transcribed: false, unanchoredReason: null };

const mcCorrection = (id: string, correct: boolean): MultipleChoiceCorrection => ({
  questionType: "multiple-choice",
  questionId: id,
  correct,
  selectedOptionId: "o1",
  correctOptionId: correct ? "o1" : "o2",
  explanation: ""
});

test("el ejemplo de la convención: 75 aciertos, 15 fallos, 4 opciones → 70 neto", () => {
  const corrections: QuestionCorrection[] = [
    ...Array.from({ length: 75 }, (_, i) => mcCorrection(`ok${i}`, true)),
    ...Array.from({ length: 15 }, (_, i) => mcCorrection(`ko${i}`, false))
  ];
  const p = penalty(corrections, "exam");
  assert.equal(p, 5); // 15 / (4 − 1)
  assert.equal(75 - p, 70);
});

test("en blanco ni suma ni resta", () => {
  const corrections: QuestionCorrection[] = [
    mcCorrection("ok", true),
    { questionType: "blank", questionId: "b", maxScore: 1, explanation: "" }
  ];
  assert.equal(penalty(corrections, "exam"), 0);
});

test("verdadero/falso: un fallo cuesta un acierto entero", () => {
  const corrections: QuestionCorrection[] = [
    { questionType: "true-false", questionId: "a", correct: false, answer: true, correctAnswer: false, explanation: "" }
  ];
  assert.equal(penalty(corrections, "exam"), 1);
});

test("en práctica la penalización es 0 aunque haya fallos", () => {
  const corrections: QuestionCorrection[] = Array.from({ length: 10 }, (_, i) => mcCorrection(`ko${i}`, false));
  assert.equal(penalty(corrections, "practice"), 0);
});

test("displayedScore escala a 10 y tiene suelo en 0", () => {
  assert.equal(displayedScore(70, 0, 90), (70 / 90) * 10);
  assert.equal(displayedScore(5, 20, 10), 0); // más penalización que aciertos → 0, no negativo
  assert.equal(displayedScore(10, 0, 10), 10);
});

test("multiple-response y short-answer no penalizan", () => {
  const corrections: QuestionCorrection[] = [
    { questionType: "multiple-response", questionId: "m", selectedOptionIds: ["o1"], correctOptionIds: ["o1", "o2"], score: 0.5, maxScore: 1, fullyCorrect: false, explanation: "" },
    { questionType: "short-answer", questionId: "s", status: "graded", score: 0, maxScore: 3, criteria: [], unevaluatedReason: null, feedback: "" }
  ];
  assert.equal(penalty(corrections, "exam"), 0);
});

test("el tiempo de un examen mixto de 20 sale del reparto, no de una constante", () => {
  const q = (type: TestQuestion["type"], id: string): TestQuestion => {
    switch (type) {
      case "multiple-choice":
        return { type, id, prompt: "", options: [], correctOptionId: "o1", explanation: "", hint: null, source };
      case "multiple-response":
        return { type, id, prompt: "", options: [], correctOptionIds: ["o1"], explanation: "", hint: null, source };
      case "true-false":
        return { type, id, prompt: "", correctAnswer: true, explanation: "", hint: null, source };
      case "short-answer":
        return { type, id, prompt: "", expectedAnswer: "", maxScore: 1, hint: null, rubric: [], source };
    }
  };
  // Reparto de un Examen de 20: 9 única, 5 múltiple, 2 v/f, 4 desarrollo (aprox. §6.2).
  const questions: TestQuestion[] = [
    ...Array.from({ length: 9 }, (_, i) => q("multiple-choice", `mc${i}`)),
    ...Array.from({ length: 5 }, (_, i) => q("multiple-response", `mr${i}`)),
    ...Array.from({ length: 2 }, (_, i) => q("true-false", `tf${i}`)),
    ...Array.from({ length: 4 }, (_, i) => q("short-answer", `sa${i}`))
  ];

  const expected =
    9 * LIMITS.examSecondsPerQuestion["multiple-choice"] +
    5 * LIMITS.examSecondsPerQuestion["multiple-response"] +
    2 * LIMITS.examSecondsPerQuestion["true-false"] +
    4 * LIMITS.examSecondsPerQuestion["short-answer"] +
    LIMITS.examReviewSeconds;

  assert.equal(timeLimitSeconds(questions), expected);
});
