import assert from "node:assert/strict";
import { test } from "node:test";
import { Option } from "effect";
import { LIMITS } from "@proxus/shared";
import { checkChatRequestLimits, checkConversationHistoryLimit, conversationHistoryWarning } from "./chat-limits.ts";

// Fase 4, decisión 6: la sesión vive en el servidor y el historial ya no llega en la petición, así
// que `messages`/`maxHistoryMessages`/`maxHistoryCharacters` dejaron de tener algo que comprobar
// aquí (cierra D3). Solo quedan `maxSteps` y `input`.

const materialRef = (id: string) => ({ type: "material" as const, materialId: id, title: id });

test("checkChatRequestLimits accepts context at the ceiling", () => {
  const context = Array.from({ length: LIMITS.maxContextRefs }, (_, index) => materialRef(`m${index}`));
  const result = checkChatRequestLimits({ input: "hola", context });
  assert.equal(Option.isNone(result), true);
});

test("checkChatRequestLimits rejects context above the ceiling", () => {
  const context = Array.from({ length: LIMITS.maxContextRefs + 1 }, (_, index) => materialRef(`m${index}`));
  const result = checkChatRequestLimits({ input: "hola", context });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxContextRefs");
});

test("checkChatRequestLimits accepts maxSteps at the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", maxSteps: LIMITS.maxAgentSteps });
  assert.equal(Option.isNone(result), true);
});

test("checkChatRequestLimits rejects maxSteps above the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", maxSteps: LIMITS.maxAgentSteps + 1 });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxAgentSteps");
});

test("checkChatRequestLimits rejects a non-integer maxSteps below the ceiling", () => {
  const result = checkChatRequestLimits({ input: "hola", maxSteps: LIMITS.maxAgentSteps - 0.1 });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxAgentSteps");
});

test("checkChatRequestLimits rejects maxSteps below 1", () => {
  const result = checkChatRequestLimits({ input: "hola", maxSteps: 0 });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxAgentSteps");
});

test("checkChatRequestLimits accepts a message exactly at the character ceiling", () => {
  const input = "a".repeat(LIMITS.maxMessageCharacters);
  const result = checkChatRequestLimits({ input });
  assert.equal(Option.isNone(result), true);
});

test("checkChatRequestLimits rejects a message one character above the ceiling", () => {
  const input = "a".repeat(LIMITS.maxMessageCharacters + 1);
  const result = checkChatRequestLimits({ input });
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxMessageCharacters");
});

test("checkConversationHistoryLimit accepts a conversation without any measured turn yet", () => {
  const result = checkConversationHistoryLimit(undefined);
  assert.equal(Option.isNone(result), true);
});

test("checkConversationHistoryLimit accepts a conversation below the ceiling", () => {
  const result = checkConversationHistoryLimit(LIMITS.maxConversationHistoryTokens - 1);
  assert.equal(Option.isNone(result), true);
});

test("checkConversationHistoryLimit rejects a conversation at or above the ceiling", () => {
  const result = checkConversationHistoryLimit(LIMITS.maxConversationHistoryTokens);
  assert.equal(Option.isSome(result), true);
  assert.equal(Option.getOrThrow(result).limit, "maxConversationHistoryTokens");
});

test("conversationHistoryWarning is silent without a measured turn", () => {
  assert.equal(conversationHistoryWarning(undefined), undefined);
});

test("conversationHistoryWarning is silent below 75% of the ceiling", () => {
  const belowThreshold = Math.floor(LIMITS.maxConversationHistoryTokens * 0.75) - 1;
  assert.equal(conversationHistoryWarning(belowThreshold), undefined);
});

test("conversationHistoryWarning fires at 75% of the ceiling", () => {
  const atThreshold = LIMITS.maxConversationHistoryTokens * 0.75;
  assert.notEqual(conversationHistoryWarning(atThreshold), undefined);
});
