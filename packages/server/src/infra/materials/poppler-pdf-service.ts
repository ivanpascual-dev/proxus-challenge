import { Effect, FileSystem, Layer, Path } from "effect";
import { LIMITS } from "@proxus/shared";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { PdfService, PdfServiceError, type PdfService as PdfServiceType } from "../../domain/materials/pdf-service.ts";

const make = (): Effect.Effect<PdfServiceType, PdfServiceError, ChildProcessSpawner | FileSystem.FileSystem | Path.Path> => Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const assertExecutable = (command: string) => spawner.exitCode(
    ChildProcess.make(command, ["-v"])
  ).pipe(
    Effect.mapError((reason) => new PdfServiceError({
      reason: `Missing required Poppler command "${command}". Install Poppler so pdfinfo, pdftoppm and pdftotext are available on PATH. Cause: ${String(reason)}`
    })),
    Effect.flatMap((exitCode) => exitCode === 0
      ? Effect.void
      : Effect.fail(new PdfServiceError({
          reason: `Missing required Poppler command "${command}". Install Poppler so pdfinfo, pdftoppm and pdftotext are available on PATH. Exit code: ${exitCode}`
        }))
    )
  );

  yield* assertExecutable("pdfinfo");
  yield* assertExecutable("pdftoppm");
  yield* assertExecutable("pdftotext");

  const pageCount = (pdfPath: string) => spawner.string(
    ChildProcess.make("pdfinfo", [pdfPath])
  ).pipe(
    Effect.map((output) => {
      const match = /^Pages:\s+(\d+)$/m.exec(output);
      if (match === null) {
        throw new Error(`Could not read page count for ${pdfPath}`);
      }
      return Number(match[1]);
    }),
    Effect.mapError((reason) => new PdfServiceError({ reason }))
  );

  // `pdfinfo -f N -l N` imprime "Page N size: W x H pts"; sin -f imprime "Page size: W x H pts".
  const pageSizeRegex = /Page(?:\s+\d+)?\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/;

  const pageSizePoints = (pdfPath: string, page: number) => spawner.string(
    ChildProcess.make("pdfinfo", ["-f", String(page), "-l", String(page), pdfPath])
  ).pipe(
    Effect.map((output) => {
      const match = pageSizeRegex.exec(output);
      if (match === null) {
        throw new Error(`Could not read page size for ${pdfPath} page ${page}`);
      }
      return { width: Number(match[1]), height: Number(match[2]) };
    }),
    Effect.mapError((reason) => new PdfServiceError({ reason }))
  );

  const renderPage: PdfServiceType["renderPage"] = ({ path: pdfPath, page }) => Effect.gen(function* () {
    const { width, height } = yield* pageSizePoints(pdfPath, page);

    const tempDirectory = yield* fs.makeTempDirectory({ prefix: "proxus-material-" }).pipe(
      Effect.mapError((reason) => new PdfServiceError({ reason }))
    );
    const outputPrefix = path.join(tempDirectory, `page-${page}`);
    const imagePath = `${outputPrefix}.png`;

    // El lado corto se fija a LIMITS.renderShortSidePixels y el otro queda en -1 (proporcional).
    const scaleArgs = width <= height
      ? ["-scale-to-x", String(LIMITS.renderShortSidePixels), "-scale-to-y", "-1"]
      : ["-scale-to-y", String(LIMITS.renderShortSidePixels), "-scale-to-x", "-1"];

    yield* spawner.exitCode(
      ChildProcess.make("pdftoppm", [
        "-singlefile",
        "-f",
        String(page),
        "-l",
        String(page),
        ...scaleArgs,
        "-png",
        pdfPath,
        outputPrefix
      ])
    ).pipe(
      Effect.mapError((reason) => new PdfServiceError({ reason }))
    );

    const bytes = yield* fs.readFile(imagePath).pipe(
      Effect.mapError((reason) => new PdfServiceError({ reason }))
    );

    yield* fs.remove(tempDirectory, { recursive: true, force: true }).pipe(
      Effect.catch(() => Effect.void)
    );

    return {
      page,
      mediaType: "image/png" as const,
      data: `data:image/png;base64,${uint8ArrayToBase64(bytes)}`
    };
  });

  const extractText: PdfServiceType["extractText"] = ({ path: pdfPath, page }) => spawner.string(
    ChildProcess.make("pdftotext", [
      "-f",
      String(page),
      "-l",
      String(page),
      pdfPath,
      "-"
    ])
  ).pipe(
    Effect.mapError((reason) => new PdfServiceError({ reason }))
  );

  return { pageCount, renderPage, extractText };
});

export const PopplerPdfService = {
  make,
  layer: Layer.effect(PdfService)(make())
};

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};
