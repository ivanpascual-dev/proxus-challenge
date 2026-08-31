import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AttemptAnswer,
  MultipleChoiceQuestion,
  MultipleResponseQuestion,
  QuestionSource,
  ShortAnswerCorrection,
  ShortAnswerQuestion,
  TrueFalseQuestion
} from "./artifact.ts";
import { correctMultipleResponse, gradeAnswers } from "./grading.ts";

const source: QuestionSource = {
  materialId: "m1",
  topicId: "t1",
  pages: [1],
  transcribed: false,
  unanchoredReason: null,
  reviewReason: null
};

const options = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, text: `Opción ${i + 1}` }));

const mc = (id: string, correctOptionId: string): MultipleChoiceQuestion => ({
  type: "multiple-choice",
  id,
  prompt: `¿${id}?`,
  options: options(4),
  correctOptionId,
  explanation: "porque sí",
  hint: null,
  source
});

const tf = (id: string, correctAnswer: boolean): TrueFalseQuestion => ({
  type: "true-false",
  id,
  prompt: `¿${id}?`,
  correctAnswer,
  explanation: "porque sí",
  hint: null,
  source
});

const mr = (id: string, correctOptionIds: readonly string[]): MultipleResponseQuestion => ({
  type: "multiple-response",
  id,
  prompt: `¿${id}?`,
  options: options(4),
  correctOptionIds: [...correctOptionIds],
  explanation: "porque sí",
  hint: null,
  source
});

const sa = (id: string, maxScore: number): ShortAnswerQuestion => ({
  type: "short-answer",
  id,
  prompt: `¿${id}?`,
  expectedAnswer: "la respuesta",
  maxScore,
  hint: null,
  rubric: [{ id: "c1", text: "toca el concepto" }],
  source
});

test("recorre las preguntas, no las respuestas: 2 de 10 dan 2/10, no 2/2 (bug de §3)", () => {
  const questions = Array.from({ length: 10 }, (_, i) => tf(`q${i + 1}`, true));
  const answers: readonly AttemptAnswer[] = [
    { questionType: "true-false", questionId: "q1", answer: true },
    { questionType: "true-false", questionId: "q2", answer: true }
  ];

  const result = gradeAnswers(questions, answers);
  assert.equal(result.rawScore, 2);
  assert.equal(result.maxScore, 10);
  assert.equal(result.corrections.length, 10);
  assert.equal(result.corrections.filter((c) => c.questionType === "blank").length, 8);
});

test("todo respondido / nada respondido / la mitad", () => {
  const questions = [tf("a", true), tf("b", false), mc("c", "o1"), mc("d", "o2")];

  const all = gradeAnswers(questions, [
    { questionType: "true-false", questionId: "a", answer: true },
    { questionType: "true-false", questionId: "b", answer: false },
    { questionType: "multiple-choice", questionId: "c", selectedOptionId: "o1" },
    { questionType: "multiple-choice", questionId: "d", selectedOptionId: "o2" }
  ]);
  assert.deepEqual([all.rawScore, all.maxScore], [4, 4]);

  const none = gradeAnswers(questions, []);
  assert.deepEqual([none.rawScore, none.maxScore], [0, 4]);
  assert.ok(none.corrections.every((c) => c.questionType === "blank"));

  const half = gradeAnswers(questions, [
    { questionType: "true-false", questionId: "a", answer: true },
    { questionType: "multiple-choice", questionId: "c", selectedOptionId: "o1" }
  ]);
  assert.deepEqual([half.rawScore, half.maxScore], [2, 4]);
});

test("múltiple respuesta: exacta, de menos, de más y mezclada", () => {
  const question = mr("q", ["o1", "o3"]);

  const exact = correctMultipleResponse(question, ["o1", "o3"]);
  assert.equal(exact.score, 1);
  assert.equal(exact.fullyCorrect, true);

  const fewer = correctMultipleResponse(question, ["o1"]);
  assert.equal(fewer.score, 0.5);
  assert.equal(fewer.fullyCorrect, false);

  const more = correctMultipleResponse(question, ["o1", "o3", "o4"]);
  assert.equal(more.score, 0.5); // (2 aciertos − 1 de más) / 2
  assert.equal(more.fullyCorrect, false);

  const mixed = correctMultipleResponse(question, ["o1", "o2"]);
  assert.equal(mixed.score, 0); // (1 acierto − 1 de más) / 2 = 0
  assert.equal(mixed.fullyCorrect, false);

  const worse = correctMultipleResponse(question, ["o2", "o4"]);
  assert.equal(worse.score, 0); // suelo en cero, no negativo
});

test("una respuesta de una pregunta que no existe se ignora, no rompe ni puntúa", () => {
  const questions = [tf("a", true)];
  const result = gradeAnswers(questions, [
    { questionType: "true-false", questionId: "a", answer: true },
    { questionType: "true-false", questionId: "fantasma", answer: true }
  ]);
  assert.deepEqual([result.rawScore, result.maxScore], [1, 1]);
  assert.equal(result.corrections.length, 1);
});

test("un desarrollo corto unevaluated no baja la nota ni sube el maxScore puntuable", () => {
  const questions = [mc("a", "o1"), sa("b", 3)];
  const openCorrections: readonly ShortAnswerCorrection[] = [
    {
      questionType: "short-answer",
      questionId: "b",
      status: "unevaluated",
      score: null,
      maxScore: 3,
      criteria: [],
      unevaluatedReason: "el juez se cayó",
      feedback: ""
    }
  ];

  const result = gradeAnswers(
    questions,
    [
      { questionType: "multiple-choice", questionId: "a", selectedOptionId: "o1" },
      { questionType: "short-answer", questionId: "b", answer: "algo escribí" }
    ],
    openCorrections
  );

  // Solo cuenta la multiple-choice: 1/1, no 1/4.
  assert.deepEqual([result.rawScore, result.maxScore], [1, 1]);
});

test("un desarrollo corto graded suma su nota y su maxScore", () => {
  const questions = [sa("b", 4)];
  const openCorrections: readonly ShortAnswerCorrection[] = [
    {
      questionType: "short-answer",
      questionId: "b",
      status: "graded",
      score: 3,
      maxScore: 4,
      criteria: [{ id: "c1", text: "toca el concepto", met: true }],
      unevaluatedReason: null,
      feedback: "bien"
    }
  ];

  const result = gradeAnswers(
    questions,
    [{ questionType: "short-answer", questionId: "b", answer: "respuesta" }],
    openCorrections
  );
  assert.deepEqual([result.rawScore, result.maxScore], [3, 4]);
});

test("un desarrollo corto sin responder es blank y cuenta su maxScore", () => {
  const questions = [sa("b", 5)];
  const result = gradeAnswers(questions, []);
  assert.equal(result.corrections[0]?.questionType, "blank");
  assert.deepEqual([result.rawScore, result.maxScore], [0, 5]);
});
