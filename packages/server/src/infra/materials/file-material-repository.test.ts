import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Effect, Exit, Layer } from "effect";
import type { MaterialIndexContent } from "@proxus/shared";
import { LIMITS } from "@proxus/shared";
import { MaterialRepository, type UploadCandidate } from "../../domain/materials/material.ts";
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

// El fichero subido vive fuera de `pdfDir` mientras dura la "petición" (simula el path temporal del
// multipart, sección 4.2 del plan de fase 4: la trampa del scope).
const withUploadDir = async (body: (uploadDir: string) => Promise<void>) => {
  const uploadDir = mkdtempSync(join(tmpdir(), "proxus-upload-"));
  try {
    await body(uploadDir);
  } finally {
    rmSync(uploadDir, { recursive: true, force: true });
  }
};

test("upload crea un material a partir de un PDF válido", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      const candidatePath = join(uploadDir, "any-temp-name");
      copyFileSync(fixturePdf, candidatePath);

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "densidad.pdf", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.upload(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "created");
      if (outcome.outcome === "created") {
        assert.equal(outcome.material.id, "densidad");
        assert.equal(outcome.material.pageCount, 4);
      }
      assert.deepEqual(readdirSync(pdfDir), ["densidad.pdf"]);
    });
  });
});

test("upload rechaza un PNG por sus bytes mágicos, sin tocar disco", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      const candidatePath = join(uploadDir, "any-temp-name");
      writeFileSync(candidatePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "notes.png", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.upload(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "rejected");
      if (outcome.outcome === "rejected") {
        assert.equal(outcome.reason._tag, "UnsupportedFileType");
      }
      assert.deepEqual(readdirSync(pdfDir), []);
    });
  });
});

test("upload rechaza un .txt que empieza por la cabecera de un PDF: el sniff pasa, pdfinfo lo tumba", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      const candidatePath = join(uploadDir, "any-temp-name");
      writeFileSync(candidatePath, "%PDF-1.4\nesto no es un PDF de verdad");

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "fake.pdf", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.upload(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "rejected");
      if (outcome.outcome === "rejected") {
        assert.equal(outcome.reason._tag, "UnsupportedFileType");
      }
      assert.deepEqual(readdirSync(pdfDir), []);
    });
  });
});

test("upload rechaza un nombre repetido y no sobreescribe el material original (ADR-011)", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      copyFileSync(fixturePdf, join(pdfDir, "densidad.pdf"));
      const originalBytes = readFileSync(join(pdfDir, "densidad.pdf"));

      const candidatePath = join(uploadDir, "any-temp-name");
      writeFileSync(candidatePath, Buffer.concat([readFileSync(fixturePdf), Buffer.from("\n% otro contenido\n")]));

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "densidad.pdf", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.upload(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "rejected");
      if (outcome.outcome === "rejected") {
        assert.equal(outcome.reason._tag, "MaterialAlreadyExists");
      }
      assert.deepEqual(readFileSync(join(pdfDir, "densidad.pdf")), originalBytes);
    });
  });
});

test("validate acepta un PDF válido sin escribir nada a disco", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      const candidatePath = join(uploadDir, "any-temp-name");
      copyFileSync(fixturePdf, candidatePath);

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "densidad.pdf", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.validate(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "valid");
      assert.deepEqual(readdirSync(pdfDir), []);
    });
  });
});

test("validate rechaza un .txt que empieza por la cabecera de un PDF, igual que upload", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      const candidatePath = join(uploadDir, "any-temp-name");
      writeFileSync(candidatePath, "%PDF-1.4\nesto no es un PDF de verdad");

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "fake.pdf", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.validate(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "rejected");
      if (outcome.outcome === "rejected") {
        assert.equal(outcome.reason._tag, "UnsupportedFileType");
      }
      assert.deepEqual(readdirSync(pdfDir), []);
    });
  });
});

test("validate rechaza un nombre que ya existe entre los materiales subidos", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      copyFileSync(fixturePdf, join(pdfDir, "densidad.pdf"));

      const candidatePath = join(uploadDir, "any-temp-name");
      copyFileSync(fixturePdf, candidatePath);

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "densidad.pdf", path: candidatePath }];
      const [outcome] = await Effect.runPromise(repo.validate(candidates));
      assert.ok(outcome, "expected exactly one outcome");

      assert.equal(outcome.outcome, "rejected");
      if (outcome.outcome === "rejected") {
        assert.equal(outcome.reason._tag, "MaterialAlreadyExists");
      }
    });
  });
});

test("validate rechaza dos ficheros del mismo lote con el mismo nombre, sin que el primero lo esconda", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      const firstPath = join(uploadDir, "first");
      const secondPath = join(uploadDir, "second");
      copyFileSync(fixturePdf, firstPath);
      copyFileSync(fixturePdf, secondPath);

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [
        { fileName: "densidad.pdf", path: firstPath },
        { fileName: "densidad.pdf", path: secondPath }
      ];
      const [first, second] = await Effect.runPromise(repo.validate(candidates));
      assert.ok(first && second, "expected two outcomes");

      assert.equal(first.outcome, "valid");
      assert.equal(second.outcome, "rejected");
      if (second.outcome === "rejected") {
        assert.equal(second.reason._tag, "MaterialAlreadyExists");
      }
      assert.deepEqual(readdirSync(pdfDir), []);
    });
  });
});

// `pagesCacheDirectory` es hermano de `pdfDir` (`file-material-repository.ts`, comentario de
// `pagesCacheDirectory`), así que aquí es `dirname(pdfDir)/pages`: bajo `os.tmpdir()` directamente,
// compartido entre tests de este fichero. Cada test usa un hash propio (bytes distintos), así que los
// nombres de fichero no chocan; se limpia solo el fichero propio, nunca el directorio entero.
const pagesDirFor = (pdfDir: string) => join(dirname(pdfDir), "pages");

const withCachedPage = async (pdfDir: string, hash: string, page: number, body: () => Promise<void>) => {
  const pagesDir = pagesDirFor(pdfDir);
  mkdirSync(pagesDir, { recursive: true });
  const pagePath = join(pagesDir, `${hash}-${page}.png`);
  writeFileSync(pagePath, Buffer.from("fake-png"));
  try {
    await body();
  } finally {
    if (existsSync(pagePath)) {
      rmSync(pagePath, { force: true });
    }
  }
};

test("remove borra el PDF, el índice y las páginas cacheadas cuando era la última referencia a su huella (ADR-027)", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    const pdfPath = join(pdfDir, "solo.pdf");
    copyFileSync(fixturePdf, pdfPath);
    const hash = hashContent(readFileSync(pdfPath));
    await putIndex(indexDir, storedContent(hash, 4));

    await withCachedPage(pdfDir, hash, 1, async () => {
      const repo = await materialRepo(pdfDir, indexDir);
      await Effect.runPromise(repo.remove("solo"));

      assert.deepEqual(readdirSync(pdfDir), []);
      assert.equal(existsSync(join(indexDir, `${hash}.json`)), false);
      assert.equal(existsSync(join(pagesDirFor(pdfDir), `${hash}-1.png`)), false);
    });
  });
});

test("remove conserva el índice y las páginas cacheadas cuando otro PDF comparte la misma huella (ADR-027)", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    const bytes = readFileSync(fixturePdf);
    const hash = hashContent(bytes);
    writeFileSync(join(pdfDir, "primero.pdf"), bytes);
    writeFileSync(join(pdfDir, "segundo.pdf"), bytes);
    await putIndex(indexDir, storedContent(hash, 4));

    await withCachedPage(pdfDir, hash, 1, async () => {
      const repo = await materialRepo(pdfDir, indexDir);
      await Effect.runPromise(repo.remove("primero"));

      assert.deepEqual(readdirSync(pdfDir), ["segundo.pdf"]);
      assert.equal(existsSync(join(indexDir, `${hash}.json`)), true);
      assert.equal(existsSync(join(pagesDirFor(pdfDir), `${hash}-1.png`)), true);
    });
  });
});

test("upload aborta la petición entera cuando pasa de maxMaterials, antes de escribir nada (F4-04)", async () => {
  await withDirs(async (pdfDir, indexDir) => {
    await withUploadDir(async (uploadDir) => {
      for (let index = 0; index < LIMITS.maxMaterials; index++) {
        copyFileSync(fixturePdf, join(pdfDir, `existing-${index}.pdf`));
      }

      const candidatePath = join(uploadDir, "any-temp-name");
      copyFileSync(fixturePdf, candidatePath);

      const repo = await materialRepo(pdfDir, indexDir);
      const candidates: readonly UploadCandidate[] = [{ fileName: "one-more.pdf", path: candidatePath }];
      const exit = await Effect.runPromiseExit(repo.upload(candidates));

      assert.equal(Exit.isFailure(exit), true);
      assert.deepEqual(readdirSync(pdfDir).sort(), Array.from({ length: LIMITS.maxMaterials }, (_, index) => `existing-${index}.pdf`).sort());
    });
  });
});
