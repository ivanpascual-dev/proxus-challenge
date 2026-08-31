import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Exit } from "effect";
import { LIMITS } from "@proxus/shared";
import { make } from "./rate-limiter.ts";

const runFailure = async (effect: Effect.Effect<unknown, unknown>) => {
  const exit = await Effect.runPromiseExit(effect);
  assert.equal(Exit.isFailure(exit), true, "expected the effect to fail");
};

test("RateLimiter rejects once the window fills up", async () => {
  let clock = 0;
  const limiter = await Effect.runPromise(make(() => clock));

  for (let index = 0; index < LIMITS.messagesPerWindow.limit; index++) {
    await Effect.runPromise(limiter.check("client-a", "messages"));
  }

  await runFailure(limiter.check("client-a", "messages"));
});

test("RateLimiter admits again once the injected clock moves past the window", async () => {
  let clock = 0;
  const limiter = await Effect.runPromise(make(() => clock));

  for (let index = 0; index < LIMITS.messagesPerWindow.limit; index++) {
    await Effect.runPromise(limiter.check("client-b", "messages"));
  }

  await runFailure(limiter.check("client-b", "messages"));

  clock += LIMITS.messagesPerWindow.windowMs + 1;

  await Effect.runPromise(limiter.check("client-b", "messages"));
});

test("RateLimiter concurrency rejects the request beyond the ceiling, and admits again after release", async () => {
  const limiter = await Effect.runPromise(make(() => 0));

  for (let index = 0; index < LIMITS.maxConcurrentRequests; index++) {
    await Effect.runPromise(limiter.acquire("client-c"));
  }

  await runFailure(limiter.acquire("client-c"));

  await Effect.runPromise(limiter.release("client-c"));

  await Effect.runPromise(limiter.acquire("client-c"));
});

test("RateLimiter checkUpload rejects once the upload window fills up", async () => {
  let clock = 0;
  const limiter = await Effect.runPromise(make(() => clock));

  for (let index = 0; index < LIMITS.uploadsPerWindow.limit; index++) {
    await Effect.runPromise(limiter.checkUpload("client-d"));
  }

  await runFailure(limiter.checkUpload("client-d"));

  clock += LIMITS.uploadsPerWindow.windowMs + 1;

  await Effect.runPromise(limiter.checkUpload("client-d"));
});

test("RateLimiter upload grace is granted, holds within its TTL, and expires afterwards", async () => {
  let clock = 0;
  const limiter = await Effect.runPromise(make(() => clock));

  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-x")), false);

  await Effect.runPromise(limiter.grantUploadGrace("material-x"));
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-x")), true);

  clock += LIMITS.uploadGraceMs + 1;
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-x")), false);
});
