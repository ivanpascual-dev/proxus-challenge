import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMessage } from "@proxus/shared";
import { invalidationsForToolCall } from "./invalidation.ts";

const toolCall = (input: string): AgentMessage =>
  ({ role: "tool-call", name: "cli", input: { input } }) as unknown as AgentMessage;

test("invalidationsForToolCall: 'artifacts note propose' invalida artifacts", () => {
  assert.deepEqual(invalidationsForToolCall(toolCall("artifacts note propose id1 '{}'")), ["artifacts"]);
});

test("invalidationsForToolCall: leer no invalida nada (el tutor ya no crea, entrega ni corrige)", () => {
  for (const cmd of [
    "artifacts list note",
    "artifacts show id1",
    "artifacts attempts id1",
    "profile show m1",
    "materials read m1 1-2"
  ]) {
    assert.deepEqual(invalidationsForToolCall(toolCall(cmd)), []);
  }
});

test("invalidationsForToolCall: mutaciones de material invalidan materials", () => {
  assert.deepEqual(invalidationsForToolCall(toolCall("materials index m1")), ["materials"]);
});

test("invalidationsForToolCall: un mensaje que no es tool-call de cli no invalida", () => {
  assert.deepEqual(
    invalidationsForToolCall({ role: "assistant", content: "hola" } as unknown as AgentMessage),
    []
  );
});
