import assert from "node:assert/strict";
import { test } from "node:test";
import type { MaterialTopic, StudyProfile, TopicStudyProfile } from "@proxus/shared";
import { nextStudyAction, orderTopicsForStudy } from "./next-study-action.ts";

const topic = (id: string, page: number, parentId: string | null = null): MaterialTopic => ({
  id,
  label: `Tema ${id}`,
  pages: [page],
  parentId,
});

const row = (
  topicId: string,
  values: Partial<Omit<TopicStudyProfile, "topicId" | "topicLabel">> = {},
): TopicStudyProfile => ({
  topicId,
  topicLabel: `Tema ${topicId}`,
  correct: 0,
  incorrect: 0,
  unevaluated: 0,
  blank: 0,
  hintsRevealed: 0,
  emphasis: false,
  ...values,
});

const profile = (
  topics: readonly TopicStudyProfile[],
  updatedAt: string | null = "2026-09-01T12:00:00.000Z",
): StudyProfile => ({ materialId: "m1", topics, updatedAt });

const base = {
  hasIndex: true,
  hasNote: true,
  topics: [topic("a", 1), topic("b", 5)],
  profile: profile([]),
} as const;

test("pide terminar el índice antes de cualquier otra recomendación", () => {
  assert.deepEqual(nextStudyAction({ ...base, hasIndex: false }), {
    kind: "finish-setup",
    target: "index",
  });
});

test("pide preparar apuntes después del índice", () => {
  assert.deepEqual(nextStudyAction({ ...base, hasNote: false }), {
    kind: "finish-setup",
    target: "notes",
  });
});

test("sin intentos elige el primer tema hoja por página", () => {
  const topics = [topic("parent", 1), topic("late", 8, "parent"), topic("early", 3, "parent")];
  assert.deepEqual(nextStudyAction({ ...base, topics, profile: profile([], null) }), {
    kind: "first-control",
    topicId: "early",
    topicLabel: "Tema early",
  });
});

test("elige el mayor número de fallos con empate estable", () => {
  const topics = [row("a", { incorrect: 2 }), row("b", { incorrect: 2, hintsRevealed: 9 })];
  assert.deepEqual(nextStudyAction({ ...base, profile: profile(topics) }), {
    kind: "review",
    topicId: "a",
    topicLabel: "Tema a",
    reason: "incorrect",
    count: 2,
  });
});

test("las pistas deciden solo cuando no hay fallos", () => {
  const topics = [row("a", { hintsRevealed: 1 }), row("b", { hintsRevealed: 3 })];
  assert.deepEqual(nextStudyAction({ ...base, profile: profile(topics) }), {
    kind: "review",
    topicId: "b",
    topicLabel: "Tema b",
    reason: "hint",
    count: 3,
  });
});

test("el énfasis decide solo cuando no hay fallos ni pistas", () => {
  const topics = [row("a"), row("b", { emphasis: true })];
  assert.deepEqual(nextStudyAction({ ...base, profile: profile(topics) }), {
    kind: "review",
    topicId: "b",
    topicLabel: "Tema b",
    reason: "emphasis",
    count: null,
  });
});

test("un fallo gana al énfasis sin sumar señales", () => {
  const topics = [row("a", { emphasis: true }), row("b", { incorrect: 1 })];
  assert.equal(nextStudyAction({ ...base, profile: profile(topics) }).kind, "review");
  assert.deepEqual(nextStudyAction({ ...base, profile: profile(topics) }), {
    kind: "review",
    topicId: "b",
    topicLabel: "Tema b",
    reason: "incorrect",
    count: 1,
  });
});

test("con actividad sin señal de repaso propone práctica nueva", () => {
  assert.deepEqual(
    nextStudyAction({ ...base, profile: profile([row("a", { correct: 2 })]) }),
    { kind: "new-practice" },
  );
});

test("los datos incompletos producen no-data", () => {
  assert.deepEqual(nextStudyAction({ ...base, profile: null }), {
    kind: "no-data",
    reason: "No hay datos suficientes todavía.",
  });
});

test("el orden del panel usa ramas separadas y empates estables", () => {
  const topics = [
    row("plain", { correct: 4 }),
    row("hint", { hintsRevealed: 2 }),
    row("marked", { emphasis: true }),
    row("incorrect-low", { incorrect: 1 }),
    row("incorrect-high", { incorrect: 3 }),
  ];
  assert.deepEqual(
    orderTopicsForStudy(topics).map((entry) => entry.topicId),
    ["incorrect-high", "incorrect-low", "hint", "marked", "plain"],
  );
});
