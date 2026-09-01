import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMessage, Conversation } from "@proxus/shared";
import {
  applyMessageToTurnView,
  emptyTurnView,
  turnViewsFromConversation,
  withFollowUpQuestions,
  withTurnFailure
} from "./turn-view.ts";

const baseConversation = (overrides: Partial<Conversation>): Conversation => ({
  id: "c1",
  title: "",
  messages: [],
  turns: [],
  createdAt: "t0",
  updatedAt: "t0",
  ...overrides
});

test("turnViewsFromConversation: un turno directo, sin herramientas, corta por messageCount", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola!" }
  ];
  const conversation = baseConversation({
    messages,
    turns: [{ startedAt: "t0", steps: [{ index: 0, usage: {}, toolCalls: [] }], input: "Hola", context: [], messageCount: 2, followUpQuestions: [] }]
  });

  const [turn] = turnViewsFromConversation(conversation);
  assert.equal(turn!.input, "Hola");
  assert.equal(turn!.assistantText, "¡Hola!");
  assert.deepEqual(turn!.calls, []);
  assert.equal(turn!.status, "success");
});

test("turnViewsFromConversation: empareja tool-call con el siguiente tool-result pendiente, en orden", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Lee mis materiales" },
    { role: "tool-call", name: "load_skill", input: { name: "use-uploaded-materials" } },
    { role: "tool-call", name: "cli", input: { input: "materials list" } },
    { role: "tool-result", name: "load_skill", result: "skill body", isFailure: false },
    { role: "tool-result", name: "cli", result: "material list", isFailure: false },
    { role: "assistant", content: "Tienes dos materiales." }
  ];
  const conversation = baseConversation({
    messages,
    turns: [{
      startedAt: "t0",
      steps: [{ index: 0, usage: {}, toolCalls: [] }],
      input: "Lee mis materiales",
      context: [],
      messageCount: 6,
      followUpQuestions: []
    }]
  });

  const [turn] = turnViewsFromConversation(conversation);
  assert.equal(turn!.calls.length, 2);
  assert.equal(turn!.calls[0]!.name, "load_skill");
  assert.equal(turn!.calls[0]!.result, "skill body");
  assert.equal(turn!.calls[1]!.name, "cli");
  assert.equal(turn!.calls[1]!.result, "material list");
  assert.equal(turn!.assistantText, "Tienes dos materiales.");
});

test("turnViewsFromConversation: un turno fallido no tiene mensaje de asistente y expone el error del último paso", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Explícame el tema 3" }
  ];
  const conversation = baseConversation({
    messages,
    turns: [{
      startedAt: "t0",
      steps: [{ index: 0, usage: {}, toolCalls: [], error: { message: "El modelo no respondió a tiempo.", at: "t0" } }],
      input: "Explícame el tema 3",
      context: [],
      messageCount: 1,
      followUpQuestions: []
    }]
  });

  const [turn] = turnViewsFromConversation(conversation);
  assert.equal(turn!.assistantText, null);
  assert.equal(turn!.status, "failure");
  assert.equal(turn!.errorMessage, "El modelo no respondió a tiempo.");
});

test("turnViewsFromConversation: varios turnos se cortan cada uno en su propio hueco, sin arrastrar mensajes", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola!" },
    { role: "user", content: "¿Qué materiales tengo?" },
    { role: "tool-call", name: "cli", input: { input: "materials list" } },
    { role: "tool-result", name: "cli", result: "lista", isFailure: false },
    { role: "assistant", content: "Tienes uno." }
  ];
  const conversation = baseConversation({
    messages,
    turns: [
      { startedAt: "t0", steps: [{ index: 0, usage: {}, toolCalls: [] }], input: "Hola", context: [], messageCount: 2, followUpQuestions: [] },
      { startedAt: "t1", steps: [{ index: 0, usage: {}, toolCalls: [] }], input: "¿Qué materiales tengo?", context: [], messageCount: 4, followUpQuestions: ["¿Quieres verlo?"] }
    ]
  });

  const [first, second] = turnViewsFromConversation(conversation);
  assert.equal(first!.assistantText, "¡Hola!");
  assert.equal(first!.calls.length, 0);
  assert.equal(second!.assistantText, "Tienes uno.");
  assert.equal(second!.calls.length, 1);
  assert.deepEqual(second!.followUpQuestions, ["¿Quieres verlo?"]);
});

test("turno en curso: se construye aplicando eventos de streaming en orden", () => {
  let turn = emptyTurnView("¿Qué materiales tengo?", [{ type: "material", materialId: "m1", title: "Material" }]);
  assert.equal(turn.status, "running");

  turn = applyMessageToTurnView(turn, { role: "tool-call", name: "cli", input: { input: "materials list" } });
  assert.equal(turn.calls.length, 1);
  assert.equal(turn.calls[0]!.hasResult, false);

  turn = applyMessageToTurnView(turn, { role: "tool-result", name: "cli", result: "lista", isFailure: false });
  assert.equal(turn.calls[0]!.hasResult, true);
  assert.equal(turn.calls[0]!.result, "lista");

  turn = applyMessageToTurnView(turn, { role: "assistant", content: "Tienes uno." });
  assert.equal(turn.status, "success");
  assert.equal(turn.assistantText, "Tienes uno.");

  turn = withFollowUpQuestions(turn, ["¿Quieres verlo?"]);
  assert.deepEqual(turn.followUpQuestions, ["¿Quieres verlo?"]);
});

test("turno en curso: un tool-result sin ninguna llamada pendiente no rompe ni inventa un emparejamiento", () => {
  const turn = applyMessageToTurnView(
    emptyTurnView("Hola", []),
    { role: "tool-result", name: "cli", result: "huérfano", isFailure: false }
  );
  assert.deepEqual(turn.calls, []);
});

test("turno en curso: un fallo se marca sin inventar una respuesta", () => {
  const turn = withTurnFailure(emptyTurnView("Hola", []), "No se pudo completar la petición.");
  assert.equal(turn.status, "failure");
  assert.equal(turn.errorMessage, "No se pudo completar la petición.");
  assert.equal(turn.assistantText, null);
});
