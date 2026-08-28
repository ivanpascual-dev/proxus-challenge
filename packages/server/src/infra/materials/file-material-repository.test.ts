import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { Effect, Exit, Layer } from "effect";
import type { MaterialIndexContent } from "@proxus/shared";
import { MaterialRepository } from "../../domain/materials/material.ts";
import { MaterialIndexRepository } from "../../domain/materials/material-index-repository.ts";
import { IndexingService } from "../../domain/materials/indexing-service.ts";
import { hashContent } from "../../domain/materials/content-hash.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { FileMaterialRepository } from "./file-material-repository.ts";
import { FileMaterialIndexRepository } from "./file-material-index-repository.ts";
import { PopplerPdfService } from "./poppler-pdf-service.ts";

const fixturePdf = fileURLToPath(new URL("../../../fixtures/materials/densidad.pdf", import.meta.url));

// reindex no se ejerce en estos tests; el Layer exige IndexingService, así que va un stub.
const StubIndexing = Layer.succeed(IndexingService, IndexingService.of({
  indexMaterial: () => Effect.die("stub: indexMaterial no debería llamarse en este test")
}));

const storedContent = (contentHash: string, pageCount: number): MaterialIndexContent => ({
  contentHash,
  pageCount,
  indexedAt: "2026-08-28T00:00:00.000Z",
  threshold: 600,
  topics: [],
  pages: [{ page: 1, provenance: "transcribed", text: "x", denseCharacters: 1, topicIds: [] }],
  failedPages: []
});

const putIndex = (indexDir: string, content: MaterialIndexContent) =>
  Effect.runPromise(
    MaterialIndexRepository.pipe(
      Effect.flatMap((repo) => repo.put(content)),
      Effect.provide(FileMaterialIndexRepository.layer(indexDir).pipe(Layer.provide(NodeServices.layer)))
    )
  );

const materialRepo = (pdfDir: string, indexDir: string) =>
  Effect.runPromise(
    MaterialRepository.pipe(
      Effect.provide(
        FileMaterialRepository.layer(pdfDir).pipe(
          Layer.provide(PopplerPdfService.layer),
          Layer.provide(FileMaterialIndexRepository.layer(indexDir)),
          Layer.provide(StubIndexing),
          Layer.provide(NodeServices.layer)
        )
      )
    )
  );

const withDirs = async (body: (pdfDir: string, indexDir: string) => Promise<void>) => {
  const pdfDir = mkdtempSync(join(tmpdir(), "proxus-mat-"));
  const indexDir = mkdtempSync(join(tmpdir(), "proxus-idx-"));
  try {
    await body(pdfDir, indexDir);
  } finally {
    rmSync(pdfDir, { recursive: true, force: true });
    rmSync(indexDir, { recursive: true, force: true });
  }
};

test("getIndex sirve el índice archivado bajo la huella del contenido actual", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    const pdfPath = join(pdfDir, "densidad.pdf");
    copyFileSync(fixturePdf, pdfPath);
    const hash = hashContent(readFileSync(pdfPath));
    await putIndex(indexDir, storedContent(hash, 4));

    const repo = await materialRepo(pdfDir, indexDir);
    const index = await Effect.runPromise(repo.getIndex("densidad"));
    assert.equal(index.materialId, "densidad");
    assert.equal(index.fileName, "densidad.pdf");
    assert.equal(index.contentHash, hash);
  });
});

test("getIndex responde MaterialNotIndexed cuando el contenido del PDF ha cambiado (ADR-011)", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    const pdfPath = join(pdfDir, "densidad.pdf");
    copyFileSync(fixturePdf, pdfPath);
    await putIndex(indexDir, storedContent(hashContent(readFileSync(pdfPath)), 4));

    // El PDF cambia: nueva huella, el índice viejo deja de corresponder.
    writeFileSync(pdfPath, Buffer.concat([readFileSync(fixturePdf), Buffer.from("\n% editado\n")]));

    const repo = await materialRepo(pdfDir, indexDir);
    const exit = await Effect.runPromiseExit(repo.getIndex("densidad"));
    assert.equal(Exit.isFailure(exit), true);
  });
});
