// Barrido de indexación: recorre packages/server/.data/materials/pdfs y, por cada PDF cuya huella de
// contenido no tenga índice, lo indexa y lo archiva.
//
//   pnpm index:materials              indexa lo que falte
//   pnpm index:materials -- --prune   indexa lo que falte y luego borra los índices huérfanos
//   pnpm index:materials -- --prune-only   solo borra los índices huérfanos (no llama al modelo)
//
// Un índice huérfano es uno cuya huella ya no corresponde a ningún PDF presente. La poda es
// explícita, nunca automática: un índice huérfano vuelve a servir si se deshace la edición del PDF.
//
// El coste real (tiempo y llamadas al modelo) sobre los PDFs reales se anota en notes/bitacora.md.

import { Cause, Console, Effect, FileSystem, Layer, Option, Path } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { GeminiModel } from "../domain/agents/gemini.ts";
import { PopplerPdfService } from "../infra/materials/poppler-pdf-service.ts";
import { FileMaterialIndexRepository } from "../infra/materials/file-material-index-repository.ts";
import { MaterialIndexRepository } from "../domain/materials/material-index-repository.ts";
import { IndexingService, IndexingServiceLive } from "../domain/materials/indexing-service.ts";
import { PdfService } from "../domain/materials/pdf-service.ts";
import { hashContent } from "../domain/materials/content-hash.ts";

const pdfsDirectory = ".data/materials/pdfs";
const indexDirectory = ".data/materials/index";

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pdf = yield* PdfService;
  const indexRepository = yield* MaterialIndexRepository;
  const indexing = yield* IndexingService;

  const shouldPrune = process.argv.includes("--prune") || process.argv.includes("--prune-only");
  const pruneOnly = process.argv.includes("--prune-only");

  const dirExists = yield* fs.exists(pdfsDirectory);
  if (!dirExists) {
    yield* Console.error(`No existe ${pdfsDirectory}. Ejecuta "pnpm run seed:demo" o añade PDFs.`);
    return;
  }

  const entries = yield* fs.readDirectory(pdfsDirectory);
  const pdfNames = entries.filter((name) => name.toLowerCase().endsWith(".pdf")).sort();

  if (pdfNames.length === 0) {
    yield* Console.error(`No hay PDFs en ${pdfsDirectory}.`);
    return;
  }

  // Las huellas de todos los PDFs presentes. Barato (sha256), no llama al modelo.
  const liveHashes: string[] = [];
  for (const fileName of pdfNames) {
    const bytes = yield* fs.readFile(path.join(pdfsDirectory, fileName));
    liveHashes.push(hashContent(bytes));
  }

  if (!pruneOnly) {
    yield* Console.log(`${pdfNames.length} PDF(s) en ${pdfsDirectory}\n`);
    const startedAt = Date.now();
    let indexed = 0;
    let skipped = 0;

    for (let i = 0; i < pdfNames.length; i++) {
      const fileName = pdfNames[i]!;
      const contentHash = liveHashes[i]!;
      const filePath = path.join(pdfsDirectory, fileName);

      const existing = yield* indexRepository.getByHash(contentHash);
      if (Option.isSome(existing)) {
        skipped += 1;
        yield* Console.log(`= ${fileName}: ya indexado (${contentHash.slice(0, 12)})`);
        continue;
      }

      // Ningún material tumba el barrido: un fallo se cuenta y se pasa al siguiente.
      const done = yield* indexOne(pdf, indexing, indexRepository, fileName, filePath, contentHash).pipe(
        Effect.catchCause((cause) => Console.error(`  ! ${fileName}: ${Cause.pretty(cause)}`).pipe(Effect.as(false)))
      );
      if (done) {
        indexed += 1;
      }
    }

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    yield* Console.log(`\nIndexadas ${indexed}, saltadas ${skipped}, en ${elapsedSeconds}s`);
  }

  if (shouldPrune) {
    const pruned = yield* indexRepository.prune(liveHashes);
    yield* Console.log(
      pruned.length === 0
        ? "prune: ningún índice huérfano"
        : `prune: borrados ${pruned.length} índices huérfanos (${pruned.map((hash) => hash.slice(0, 12)).join(", ")})`
    );
  }
});

const indexOne = (
  pdf: PdfService,
  indexing: IndexingService,
  indexRepository: MaterialIndexRepository,
  fileName: string,
  filePath: string,
  contentHash: string
) => Effect.gen(function* () {
  const pageCount = yield* pdf.pageCount(filePath);
  yield* Console.log(`+ ${fileName}: indexando ${pageCount} páginas...`);

  const content = yield* indexing.indexMaterial(
    { path: filePath, contentHash, pageCount },
    (progress) => Console.log(`    ${progress.message}`)
  );

  yield* indexRepository.put(content);
  const transcribed = content.pages.filter((page) => page.provenance === "transcribed").length;
  yield* Console.log(
    `  ${fileName}: ${content.pages.length} páginas` +
    ` (${transcribed} transcritas, ${content.failedPages.length} fallidas), ${content.topics.length} temas`
  );
  return true;
});

const MainLayer = Layer.mergeAll(
  GeminiModel,
  NodeServices.layer,
  PopplerPdfService.layer.pipe(Layer.provide(NodeServices.layer)),
  IndexingServiceLive.pipe(
    Layer.provide(PopplerPdfService.layer),
    Layer.provide(NodeServices.layer)
  ),
  FileMaterialIndexRepository.layer(indexDirectory).pipe(Layer.provide(NodeServices.layer))
);

if (import.meta.main) {
  Effect.runPromise(program.pipe(Effect.provide(MainLayer))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
