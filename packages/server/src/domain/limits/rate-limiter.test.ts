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

test("RateLimiter renewing the upload grace resets its TTL (ADR-028: no la agota un indexado largo)", async () => {
  let clock = 0;
  const limiter = await Effect.runPromise(make(() => clock));

  await Effect.runPromise(limiter.grantUploadGrace("material-y"));

  clock += LIMITS.uploadGraceMs - 1;
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-y")), true);

  // Renovar (mismo `grantUploadGrace`) cuando todavía queda un instante de gracia extiende el TTL
  // completo desde este momento, en vez de dejar que expire.
  await Effect.runPromise(limiter.grantUploadGrace("material-y"));
  clock += LIMITS.uploadGraceMs - 1;
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-y")), true);

  clock += 2;
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-y")), false);
});

test("RateLimiter revokes the upload grace, idempotently", async () => {
  const limiter = await Effect.runPromise(make(() => 0));

  await Effect.runPromise(limiter.grantUploadGrace("material-z"));
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-z")), true);

  await Effect.runPromise(limiter.revokeUploadGrace("material-z"));
  assert.equal(await Effect.runPromise(limiter.hasUploadGrace("material-z")), false);

  // Revocar un material sin gracia (ya revocada, o que nunca la tuvo) no falla.
  await Effect.runPromise(limiter.revokeUploadGrace("material-z"));
  await Effect.runPromise(limiter.revokeUploadGrace("material-never-had-one"));
});
