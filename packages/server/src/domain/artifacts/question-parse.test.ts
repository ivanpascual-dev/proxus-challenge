import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGeneratedQuestions, type DroppedQuestion, type ParsedQuestion } from "./question-parse.ts";

const mc = (over: Record<string, unknown> = {}) => ({
  type: "multiple-choice",
  prompt: "¿Cuál?",
  options: ["Uno", "Dos", "Tres", "Cuatro"],
  correctIndex: 0,
  explanation: "porque uno",
  hint: "piensa",
  ...over
});

const wrap = (...questions: unknown[]) => JSON.stringify({ questions });

const questionsOf = (
  result: ReturnType<typeof parseGeneratedQuestions>
): { questions: readonly ParsedQuestion[]; dropped: readonly DroppedQuestion[] } => {
  if (result.kind !== "questions") {
    throw new assert.AssertionError({ message: `esperaba 'questions', llegó '${result.kind}'` });
  }
  return { questions: result.questions, dropped: result.dropped };
};

const first = <T>(items: readonly T[]): T => {
  assert.ok(items.length > 0, "esperaba al menos un elemento");
  return items[0] as T;
};

test("JSON con valla de markdown se parsea", () => {
  const raw = "```json\n" + wrap(mc()) + "\n```";
  assert.equal(questionsOf(parseGeneratedQuestions(raw)).questions.length, 1);
});

test("JSON con texto alrededor se parsea", () => {
  const raw = "Aquí tienes las preguntas:\n" + wrap(mc()) + "\nEspero que sirvan.";
  assert.equal(questionsOf(parseGeneratedQuestions(raw)).questions.length, 1);
});

test("tres opciones en vez de cuatro: se cae en voz alta", () => {
  const result = questionsOf(parseGeneratedQuestions(wrap(mc({ options: ["Uno", "Dos", "Tres"] }))));
  assert.equal(result.questions.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.match(first(result.dropped).reason, /cuatro/);
});

test("correctIndex a 7: se cae", () => {
  const result = questionsOf(parseGeneratedQuestions(wrap(mc({ correctIndex: 7 }))));
  assert.equal(result.questions.length, 0);
  assert.match(first(result.dropped).reason, /correctIndex/);
});

test("correctIndexes con una sola entrada: se cae", () => {
  const mr = {
    type: "multiple-response",
    prompt: "¿Cuáles?",
    options: ["Uno", "Dos", "Tres", "Cuatro"],
    correctIndexes: [1],
    explanation: "e",
    hint: null
  };
  const result = questionsOf(parseGeneratedQuestions(wrap(mr)));
  assert.equal(result.questions.length, 0);
  assert.match(first(result.dropped).reason, /dos o tres/);
});

test("enunciado vacío: se cae", () => {
  const result = questionsOf(parseGeneratedQuestions(wrap(mc({ prompt: "   " }))));
  assert.equal(result.questions.length, 0);
  assert.match(first(result.dropped).reason, /enunciado/);
});

test("rúbrica ausente en un desarrollo corto: se cae", () => {
  const sa = { type: "short-answer", prompt: "Explica X", expectedAnswer: "X es Y", explanation: "e", hint: null };
  const result = questionsOf(parseGeneratedQuestions(wrap(sa)));
  assert.equal(result.questions.length, 0);
  assert.match(first(result.dropped).reason, /rúbrica|rubric/i);
});

test("array de preguntas vacío: cero preguntas, cero descartes", () => {
  const result = questionsOf(parseGeneratedQuestions(wrap()));
  assert.equal(result.questions.length, 0);
  assert.equal(result.dropped.length, 0);
});

test("insufficientContent junto a preguntas válidas: se conservan, con la bandera puesta", () => {
  const result = parseGeneratedQuestions(JSON.stringify({ questions: [mc()], insufficientContent: true }));
  assert.equal(result.kind, "questions");
  if (result.kind === "questions") {
    assert.equal(result.questions.length, 1);
    assert.equal(result.insufficientContent, true);
  }
});

test("questions sin insufficientContent: la bandera queda a false", () => {
  const result = parseGeneratedQuestions(wrap(mc()));
  assert.equal(result.kind, "questions");
  assert.equal(result.kind === "questions" ? result.insufficientContent : true, false);
});

test("formato antiguo {insufficientContent, maxPossible} sin `questions`: legacy-insufficient", () => {
  const result = parseGeneratedQuestions(JSON.stringify({ insufficientContent: true, maxPossible: 3 }));
  assert.equal(result.kind, "legacy-insufficient");
  assert.equal(result.kind === "legacy-insufficient" ? result.maxPossible : -1, 3);
});

test("formato antiguo sin maxPossible numérico: se interpreta como 0", () => {
  const result = parseGeneratedQuestions(JSON.stringify({ insufficientContent: true }));
  assert.equal(result.kind === "legacy-insufficient" ? result.maxPossible : -1, 0);
});

test("respuesta que no es JSON: unparseable", () => {
  const result = parseGeneratedQuestions("lo siento, no puedo ayudar con eso");
  assert.equal(result.kind, "unparseable");
});

test("cuatro textos entran y salen con ids a, b, c, d en ese orden", () => {
  const question = first(questionsOf(parseGeneratedQuestions(wrap(mc({ correctIndex: 2 })))).questions);
  assert.equal(question.type, "multiple-choice");
  if (question.type === "multiple-choice") {
    assert.deepEqual(question.options.map((option) => option.id), ["a", "b", "c", "d"]);
    assert.deepEqual(question.options.map((option) => option.text), ["Uno", "Dos", "Tres", "Cuatro"]);
    assert.equal(question.correctOptionId, "c");
  }
});

test("opciones repetidas: se cae", () => {
  const result = questionsOf(parseGeneratedQuestions(wrap(mc({ options: ["Uno", "Uno", "Tres", "Cuatro"] }))));
  assert.equal(result.questions.length, 0);
  assert.match(first(result.dropped).reason, /repetid/);
});

test("una buena y una rota: sobrevive la buena, se anota la rota con su índice", () => {
  const result = questionsOf(parseGeneratedQuestions(wrap(mc(), mc({ correctIndex: 9 }))));
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.dropped.map((entry) => entry.index), [1]);
});

test("los criterios de la rúbrica reciben ids c1, c2, …", () => {
  const sa = {
    type: "short-answer",
    prompt: "Explica X",
    expectedAnswer: "X es Y",
    rubric: ["menciona A", "relaciona A con B"],
    explanation: "e",
    hint: null
  };
  const question = first(questionsOf(parseGeneratedQuestions(wrap(sa))).questions);
  assert.equal(question.type, "short-answer");
  if (question.type === "short-answer") {
    assert.deepEqual(question.rubric.map((criterion) => criterion.id), ["c1", "c2"]);
  }
});
