import assert from "node:assert/strict";
import { test } from "node:test";
import { Option } from "effect";
import { LIMITS, type AgentMessage } from "@proxus/shared";
import { checkChatRequestLimits } from "./chat-limits.ts";

const historyOf = (count: number): readonly AgentMessage[] =>
  Array.from({ length: count }, (): AgentMessage => ({ role: "user", content: "hola" }));

test("checkChatRequestLimits accepts maxSteps at the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", messages: [], maxSteps: LIMITS.maxAgentSteps });
  assert.equal(Option.isNone(result), true);
});

test("checkChatRequestLimits rejects maxSteps above the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", messages: [], maxSteps: LIMITS.maxAgentSteps + 1 });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxAgentSteps");
});

test("checkChatRequestLimits rejects a non-integer maxSteps below the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", messages: [], maxSteps: LIMITS.maxAgentSteps - 0.1 });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxAgentSteps");
});

test("checkChatRequestLimits rejects maxSteps below 1", () => {
  const result = checkChatRequestLimits({ input: "hola", messages: [], maxSteps: 0 });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxAgentSteps");
});

test("checkChatRequestLimits accepts a message exactly at the character ceiling", () => {
  const input = "a".repeat(LIMITS.maxMessageCharacters);
  const result = checkChatRequestLimits({ input, messages: [] });
  assert.equal(Option.isNone(result), true);
});

test("checkChatRequestLimits rejects a message one character above the ceiling", () => {
  const input = "a".repeat(LIMITS.maxMessageCharacters + 1);
  const result = checkChatRequestLimits({ input, messages: [] });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxMessageCharacters");
});

test("checkChatRequestLimits accepts history exactly at the message-count ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", messages: historyOf(LIMITS.maxHistoryMessages) });
  assert.equal(Option.isNone(result), true);
});

test("checkChatRequestLimits rejects history one message above the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", messages: historyOf(LIMITS.maxHistoryMessages + 1) });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxHistoryMessages");
});
