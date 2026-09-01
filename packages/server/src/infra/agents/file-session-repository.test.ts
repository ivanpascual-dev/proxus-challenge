import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Effect, Layer } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { SessionRepository } from "../../domain/agents/harness/index.ts";
import { FileSessionRepository } from "./file-session-repository.ts";

// C5-07: el orden del historial se decide en servidor. Estos casos escriben ficheros de sesión con
// fechas controladas (algo que `makeSession` no permite, siempre usa `new Date()`) y comprueban qué
// devuelve `listSessions`.

const spokenSession = (id: string, createdAt: string, updatedAt: string) => ({
  id,
  title: id,
  messages: [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola!" }
  ],
  turns: [
    { startedAt: updatedAt, steps: [], input: "Hola", context: [], messageCount: 2, followUpQuestions: [] }
  ],
  createdAt,
  updatedAt
});

const emptySession = (id: string, createdAt: string, updatedAt: string) => ({
  id,
  title: "",
  messages: [],
  turns: [],
  createdAt,
  updatedAt
});

const run = <A>(directory: string, program: (repo: SessionRepository) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* SessionRepository;
      return yield* program(repo);
    }).pipe(
      Effect.provide(FileSessionRepository.layer(directory).pipe(Layer.provide(NodeServices.layer)))
    )
  );

const withTempDir = async (body: (directory: string) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), "proxus-sessions-"));
  try {
    await body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const writeSession = (directory: string, session: { readonly id: string }) => {
  writeFileSync(join(directory, `${encodeURIComponent(session.id)}.json`), `${JSON.stringify(session, null, 2)}\n`);
};

test("listSessions: las conversaciones con turnos van primero, ordenadas por updatedAt descendente, y las vacías al final", async () => {
  await withTempDir(async (directory) => {
    writeSession(directory, emptySession("draft-nuevo", "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"));
    writeSession(directory, spokenSession("charla-vieja", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"));
    writeSession(directory, spokenSession("charla-nueva", "2026-03-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"));

    const summaries = await run(directory, (repo) => repo.listSessions());
    assert.deepEqual(summaries.map((s) => s.id), ["charla-nueva", "charla-vieja", "draft-nuevo"]);
  });
});

test("listSessions: fechas idénticas desempatan de forma estable por id ascendente", async () => {
  await withTempDir(async (directory) => {
    const mark = "2026-03-01T00:00:00.000Z";
    writeSession(directory, spokenSession("c", mark, mark));
    writeSession(directory, spokenSession("a", mark, mark));
    writeSession(directory, spokenSession("b", mark, mark));

    const summaries = await run(directory, (repo) => repo.listSessions());
    assert.deepEqual(summaries.map((s) => s.id), ["a", "b", "c"]);
  });
});
