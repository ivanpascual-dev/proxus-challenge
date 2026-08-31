import assert from "node:assert/strict";
import { test } from "node:test";
import type { JudgeQuestion } from "./open-answer-judge.ts";
import { interpretJudgeResponse } from "./open-answer-judge.ts";

const question: JudgeQuestion = {
  questionId: "q1",
  prompt: "Relaciona la varianza con la desviación típica",
  expectedAnswer: "la desviación típica es la raíz de la varianza",
  rubric: [
    { id: "c1", text: "menciona la relación de raíz cuadrada" },
    { id: "c2", text: "distingue las unidades" }
  ],
  maxScore: 1,
  answer: "la desviación típica es la raíz cuadrada de la varianza y va en las mismas unidades que los datos",
  materialExcerpt: "La desviación típica es la raíz cuadrada de la varianza."
};

test("todos los criterios cumplidos: graded con score completo", () => {
  const correction = interpretJudgeResponse(
    JSON.stringify({ gradable: true, criteria: [{ id: "c1", met: true }, { id: "c2", met: true }], feedback: "bien" }),
    question
  );
  assert.equal(correction?.status, "graded");
  assert.equal(correction?.score, 1);
  assert.deepEqual(correction?.criteria.map((c) => c.met), [true, true]);
});

test("la mitad de los criterios: score parcial, y los que no son los que faltan", () => {
  const correction = interpretJudgeResponse(
    JSON.stringify({ gradable: true, criteria: [{ id: "c1", met: true }, { id: "c2", met: false }], feedback: "" }),
    question
  );
  assert.equal(correction?.status, "graded");
  assert.equal(correction?.score, 0.5);
  assert.equal(correction?.criteria.find((c) => c.id === "c2")?.met, false);
});

test("gradable: false → unevaluated, sin nota, con motivo", () => {
  const correction = interpretJudgeResponse(
    JSON.stringify({ gradable: false, criteria: [], feedback: "no tiene relación con la pregunta" }),
    question
  );
  assert.equal(correction?.status, "unevaluated");
  assert.equal(correction?.score, null);
  assert.match(correction?.unevaluatedReason ?? "", /no pudo corregir/);
});

test("el juez devuelve criterios que no casan con la rúbrica → unevaluated", () => {
  const correction = interpretJudgeResponse(
    JSON.stringify({ gradable: true, criteria: [{ id: "c1", met: true }], feedback: "" }),
    question
  );
  assert.equal(correction?.status, "unevaluated");
  assert.match(correction?.unevaluatedReason ?? "", /criterios/);
});

test("respuesta que no es JSON → null (quien llama lo hace unevaluated)", () => {
  assert.equal(interpretJudgeResponse("lo siento, no puedo", question), null);
});
