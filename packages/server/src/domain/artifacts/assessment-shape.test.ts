import assert from "node:assert/strict";
import { test } from "node:test";
import { plan, type AssessableQuestionType, type PlanInput } from "./assessment-shape.ts";

const topics = (...ids: string[]) => ids.map((id) => ({ id }));

const countByType = (holes: readonly { questionType: AssessableQuestionType }[]) => {
  const counts: Record<string, number> = {};
  for (const hole of holes) {
    counts[hole.questionType] = (counts[hole.questionType] ?? 0) + 1;
  }
  return counts;
};

const holesOf = (outcome: ReturnType<typeof plan>) => {
  assert.equal(outcome.kind, "holes");
  return outcome.kind === "holes" ? outcome.holes : [];
};

test("un Control de tema hoja: todos los huecos son de ese tema y motivo 'nueva'", () => {
  const holes = holesOf(plan({ kind: "quiz", origin: "material", topics: topics("t1"), questionCount: 6 }));
  assert.equal(holes.length, 6);
  assert.ok(holes.every((hole) => hole.topicId === "t1"));
  assert.ok(holes.every((hole) => hole.reason === "nueva"));
});

test("un tema padre con tres hijos: el reparto suma exactamente lo pedido y toca los tres", () => {
  const holes = holesOf(plan({ kind: "quiz", origin: "material", topics: topics("a", "b", "c"), questionCount: 6 }));
  assert.equal(holes.length, 6);
  assert.deepEqual([...new Set(holes.map((hole) => hole.topicId))].sort(), ["a", "b", "c"]);
});

test("el material entero: suma exactamente lo pedido sobre todos los temas", () => {
  const holes = holesOf(plan({
    kind: "test",
    origin: "material",
    topics: topics("t1", "t2", "t3", "t4", "t5"),
    questionCount: 20
  }));
  assert.equal(holes.length, 20);
});

test("Control: reparto 70/30 (6 preguntas → 4 única, 2 desarrollo corto)", () => {
  const holes = holesOf(plan({ kind: "quiz", origin: "material", topics: topics("t1"), questionCount: 6 }));
  assert.deepEqual(countByType(holes), { "multiple-choice": 4, "short-answer": 2 });
});

test("Examen de 10: reparto 5/2/1/2 comprobado a mano en el plan", () => {
  const holes = holesOf(plan({ kind: "test", origin: "material", topics: topics("t1"), questionCount: 10 }));
  assert.deepEqual(countByType(holes), {
    "multiple-choice": 5,
    "multiple-response": 2,
    "true-false": 1,
    "short-answer": 2
  });
});

test("Examen de 30: reparto 14/7/3/6 comprobado a mano en el plan", () => {
  const holes = holesOf(plan({ kind: "test", origin: "material", topics: topics("t1"), questionCount: 30 }));
  assert.deepEqual(countByType(holes), {
    "multiple-choice": 14,
    "multiple-response": 7,
    "true-false": 3,
    "short-answer": 6
  });
});

test("con el mínimo del rango todos los tipos salen al menos una vez", () => {
  const quiz = countByType(holesOf(plan({ kind: "quiz", origin: "material", topics: topics("t1"), questionCount: 4 })));
  assert.ok((quiz["multiple-choice"] ?? 0) >= 1 && (quiz["short-answer"] ?? 0) >= 1);
  const test10 = countByType(holesOf(plan({ kind: "test", origin: "material", topics: topics("t1"), questionCount: 10 })));
  for (const type of ["multiple-choice", "multiple-response", "true-false", "short-answer"]) {
    assert.ok((test10[type] ?? 0) >= 1, `falta el tipo ${type}`);
  }
});

test("fuera de rango se rechaza nombrando el rango", () => {
  const low = plan({ kind: "quiz", origin: "material", topics: topics("t1"), questionCount: 3 });
  assert.equal(low.kind, "out-of-range");
  assert.match(low.kind === "out-of-range" ? low.message : "", /entre 4 y 8/);
  const high = plan({ kind: "test", origin: "material", topics: topics("t1"), questionCount: 40 });
  assert.equal(high.kind, "out-of-range");
  assert.match(high.kind === "out-of-range" ? high.message : "", /entre 10 y 30/);
});

test("dos llamadas con la misma entrada dan el mismo plan", () => {
  const input: PlanInput = { kind: "test", origin: "material", topics: topics("a", "b", "c"), questionCount: 17 };
  assert.deepEqual(plan(input), plan(input));
});

test("repaso con perfil vacío devuelve vacío", () => {
  const outcome = plan({ kind: "quiz", origin: "review", topics: topics("t1", "t2"), questionCount: 6, signals: [] });
  assert.deepEqual(holesOf(outcome), []);
});

test("repaso concentra los huecos en el tema con más fallos, con motivo 'fallada'", () => {
  const holes = holesOf(plan({
    kind: "test",
    origin: "review",
    topics: topics("poco", "mucho"),
    questionCount: 12,
    signals: [
      { topicId: "poco", incorrect: 1, hintsRevealed: 0, emphasis: false },
      { topicId: "mucho", incorrect: 8, hintsRevealed: 0, emphasis: false }
    ]
  }));
  const mucho = holes.filter((hole) => hole.topicId === "mucho").length;
  const poco = holes.filter((hole) => hole.topicId === "poco").length;
  assert.ok(mucho > poco);
  assert.ok(holes.filter((hole) => hole.topicId === "mucho").every((hole) => hole.reason === "fallada"));
});

test("un tema marcado sin fallos recibe huecos con motivo 'marcada'", () => {
  const holes = holesOf(plan({
    kind: "quiz",
    origin: "review",
    topics: topics("t1"),
    questionCount: 6,
    signals: [{ topicId: "t1", incorrect: 0, hintsRevealed: 0, emphasis: true }]
  }));
  assert.equal(holes.length, 6);
  assert.ok(holes.every((hole) => hole.reason === "marcada"));
});

test("un tema consultado con pista recibe huecos con motivo 'pista'", () => {
  const holes = holesOf(plan({
    kind: "quiz",
    origin: "review",
    topics: topics("t1"),
    questionCount: 6,
    signals: [{ topicId: "t1", incorrect: 0, hintsRevealed: 3, emphasis: false }]
  }));
  assert.ok(holes.every((hole) => hole.reason === "pista"));
});
