import { Effect, FileSystem, Layer, Option, Path } from "effect";
import {
  MaterialNotFound,
  MaterialRepository,
  MaterialRepositoryError,
  type MaterialRepository as MaterialRepositoryType,
  type PdfMaterial,
  type RenderedPage
} from "../../domain/materials/material.ts";
import { PdfService } from "../../domain/materials/pdf-service.ts";

interface PdfFile {
  readonly material: PdfMaterial;
  readonly path: string;
}

export const FileMaterialRepository = {
  make: (directory: string): Effect.Effect<MaterialRepositoryType, never, FileSystem.FileSystem | Path.Path | PdfService> => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pdf = yield* PdfService;
    const mapError = (reason: unknown) => new MaterialRepositoryError({ reason });

    const pdfPath = (fileName: string) => path.join(directory, fileName);

    const listFiles = (): Effect.Effect<readonly PdfFile[], MaterialRepositoryError> => Effect.gen(function* () {
      yield* fs.makeDirectory(directory, { recursive: true }).pipe(
        Effect.mapError(mapError)
      );

      const entries = yield* fs.readDirectory(directory).pipe(
        Effect.mapError(mapError)
      );

      return yield* Effect.forEach(
        entries.filter((entry) => path.extname(entry).toLowerCase() === ".pdf").sort(),
        (fileName): Effect.Effect<PdfFile, MaterialRepositoryError> => Effect.gen(function* () {
          const fullPath = pdfPath(fileName);
          const stat = yield* fs.stat(fullPath).pipe(
            Effect.mapError(mapError)
          );
          const material: PdfMaterial = {
            id: path.basename(fileName, ".pdf"),
            title: path.basename(fileName, ".pdf"),
            fileName,
            pageCount: yield* pdf.pageCount(fullPath).pipe(Effect.mapError(mapError)),
            uploadedAt: Option.getOrElse(stat.mtime, () => new Date(0)).toISOString()
          };
          return { material, path: fullPath };
        }),
        { concurrency: 1 }
      );
    });

    const getFile = (id: string): Effect.Effect<PdfFile, MaterialNotFound | MaterialRepositoryError> => Effect.gen(function* () {
      const files = yield* listFiles();
      const found = files.find((file) => file.material.id === id);
      if (found === undefined) {
        return yield* new MaterialNotFound({ materialId: id });
      }
      return found;
    });

    const list = () => listFiles().pipe(
      Effect.map((files) => files.map((file) => file.material))
    );

    const get = (id: string) => getFile(id).pipe(
      Effect.map((file) => file.material)
    );

    const renderPage = (
      id: string,
      page: number
    ): Effect.Effect<RenderedPage, MaterialNotFound | MaterialRepositoryError> => Effect.gen(function* () {
      const file = yield* getFile(id);
      if (page < 1 || page > file.material.pageCount) {
        return yield* new MaterialRepositoryError({
          reason: `Page ${page} is outside 1-${file.material.pageCount} for material ${id}`
        });
      }

      const image = yield* pdf.renderPage({ path: file.path, page }).pipe(Effect.mapError(mapError));
      return { material: file.material, image };
    });

    return { list, get, renderPage };
  }),
  layer: (directory: string) => Layer.effect(MaterialRepository)(FileMaterialRepository.make(directory))
};
