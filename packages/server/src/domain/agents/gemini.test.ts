import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeGeminiResponse, toFinishReason, toUsage } from "./gemini.ts";

test("decodeGeminiResponse + toUsage: acierto de caché se mapea (§4.2 del plan de fase 4)", () => {
  const json = decodeGeminiResponse({
    candidates: [{ content: { parts: [{ text: "hola" }] }, finishReason: "STOP" }],
    usageMetadata: {
      promptTokenCount: 17846,
      candidatesTokenCount: 40,
      totalTokenCount: 17886,
      cachedContentTokenCount: 12263
    }
  });

  const usage = toUsage(json.usageMetadata);
  assert.equal(usage.inputTokens.total, 17846);
  assert.equal(usage.inputTokens.cacheRead, 12263);
  assert.equal(usage.inputTokens.uncached, 17846 - 12263);
  assert.equal(usage.outputTokens.total, 40);
});

test("toUsage: sin acierto de caché, cacheRead queda undefined y uncached es igual al total", () => {
  const usage = toUsage({ promptTokenCount: 100, candidatesTokenCount: 20 });
  assert.equal(usage.inputTokens.total, 100);
  assert.equal(usage.inputTokens.cacheRead, undefined);
  assert.equal(usage.inputTokens.uncached, 100);
});

test("toUsage: sin usageMetadata, todos los campos quedan undefined (invariante 3, nunca un cero)", () => {
  const usage = toUsage(undefined);
  assert.equal(usage.inputTokens.total, undefined);
  assert.equal(usage.inputTokens.uncached, undefined);
  assert.equal(usage.inputTokens.cacheRead, undefined);
  assert.equal(usage.outputTokens.total, undefined);
  assert.equal(usage.outputTokens.reasoning, undefined);
});

test("toUsage: los tokens de pensamiento se mapean a outputTokens.reasoning", () => {
  const usage = toUsage({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 200 });
  assert.equal(usage.outputTokens.reasoning, 200);
});

test("toFinishReason: distingue STOP y MAX_TOKENS (riesgo 10 del plan) y el resto cae a other/unknown", () => {
  assert.equal(toFinishReason("STOP"), "stop");
  assert.equal(toFinishReason("MAX_TOKENS"), "length");
  assert.equal(toFinishReason("SAFETY"), "other");
  assert.equal(toFinishReason(undefined), "unknown");
});
