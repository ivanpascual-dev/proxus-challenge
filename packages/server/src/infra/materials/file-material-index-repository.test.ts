import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Effect, Layer, Option } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { MaterialIndexContent } from "@proxus/shared";
import { MaterialIndexRepository } from "../../domain/materials/material-index-repository.ts";
import { FileMaterialIndexRepository } from "./file-material-index-repository.ts";

const contentFor = (contentHash: string): MaterialIndexContent => ({
  contentHash,
  pageCount: 1,
  indexedAt: "2026-08-28T00:00:00.000Z",
  threshold: 600,
  topics: [{ id: "sets", label: "set", pages: [1] }],
  pages: [{ page: 1, provenance: "transcribed", text: "PYTHON", denseCharacters: 6, topicIds: ["sets"] }],
  failedPages: []
});

const run = <A>(directory: string, program: (repo: MaterialIndexRepository) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* MaterialIndexRepository;
      return yield* program(repo);
    }).pipe(
      Effect.provide(FileMaterialIndexRepository.layer(directory).pipe(Layer.provide(NodeServices.layer)))
    )
  );

const withTempDir = async (body: (directory: string) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), "proxus-index-"));
  try {
    await body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("getByHash returns none before anything is stored", async () => {
  await withTempDir(async (directory) => {
    const result = await run(directory, (repo) => repo.getByHash("deadbeef"));
    assert.equal(Option.isNone(result), true);
  });
});

test("put then getByHash round-trips the stored content", async () => {
  await withTempDir(async (directory) => {
    await run(directory, (repo) => repo.put(contentFor("abc123")));
    const result = await run(directory, (repo) => repo.getByHash("abc123"));
    assert.equal(Option.isSome(result), true);
    assert.deepEqual(Option.getOrThrow(result).pages, contentFor("abc123").pages);
  });
});

test("prune deletes indexes whose hash is not live and reports them", async () => {
  await withTempDir(async (directory) => {
    await run(directory, (repo) => repo.put(contentFor("live-hash")));
    await run(directory, (repo) => repo.put(contentFor("orphan-hash")));
    const pruned = await run(directory, (repo) => repo.prune(["live-hash"]));
    assert.deepEqual([...pruned], ["orphan-hash"]);
    assert.equal(Option.isSome(await run(directory, (repo) => repo.getByHash("live-hash"))), true);
    assert.equal(Option.isNone(await run(directory, (repo) => repo.getByHash("orphan-hash"))), true);
  });
});
