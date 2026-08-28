import { Effect, FileSystem, Layer, Option, Path } from "effect";
import type { LanguageModel } from "effect/unstable/ai";
import type { MaterialIndex, MaterialIndexContent } from "@proxus/shared";
import {
  MaterialIndexingFailed,
  MaterialNotFound,
  MaterialNotIndexed,
  MaterialRepository,
  MaterialRepositoryError,
  type MaterialRepository as MaterialRepositoryType,
  type PdfMaterial,
  type RenderedPage
} from "../../domain/materials/material.ts";
import { PdfService } from "../../domain/materials/pdf-service.ts";
import { MaterialIndexRepository } from "../../domain/materials/material-index-repository.ts";
import { IndexingService, type IndexProgress } from "../../domain/materials/indexing-service.ts";
import { hashContent } from "../../domain/materials/content-hash.ts";

interface PdfFile {
  readonly material: PdfMaterial;
  readonly path: string;
}

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bytesToDataUrl = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/png;base64,${btoa(binary)}`;
};

export const FileMaterialRepository = {
  make: (directory: string): Effect.Effect<MaterialRepositoryType, never, FileSystem.FileSystem | Path.Path | PdfService | MaterialIndexRepository | IndexingService> => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pdf = yield* PdfService;
    const indexRepository = yield* MaterialIndexRepository;
    const indexing = yield* IndexingService;
    const mapError = (reason: unknown) => new MaterialRepositoryError({ reason });

    const pdfPath = (fileName: string) => path.join(directory, fileName);

    // Cada renderPage lanza un pdftoppm; el visor de la web pide páginas en bucle. Se cachean por
    // contenido (sha256 del PDF), hermano de la carpeta de PDFs: .data/materials/pages.
    const pagesCacheDirectory = path.join(path.dirname(directory), "pages");

    const contentHash = (fullPath: string) => fs.readFile(fullPath).pipe(
      Effect.map(hashContent),
      Effect.mapError(mapError)
    );

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
          // Una sola pasada: la huella sirve para pageCount indirectamente y para el indexState, sin
          // una segunda petición por material (criterio F1-16).
          const hash = yield* contentHash(fullPath);
          const indexed = yield* indexRepository.getByHash(hash).pipe(Effect.mapError(mapError));
          const material: PdfMaterial = {
            id: path.basename(fileName, ".pdf"),
            title: path.basename(fileName, ".pdf"),
            fileName,
            pageCount: yield* pdf.pageCount(fullPath).pipe(Effect.mapError(mapError)),
            uploadedAt: Option.getOrElse(stat.mtime, () => new Date(0)).toISOString(),
            indexState: Option.isSome(indexed) ? "indexed" : "not-indexed"
          };
          return { material, path: fullPath };
        }),
        { concurrency: 4 }
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

      const hash = yield* contentHash(file.path);
      const cachePath = path.join(pagesCacheDirectory, `${hash}-${page}.png`);

      const cached = yield* fs.readFile(cachePath).pipe(
        Effect.map(Option.some),
        Effect.catch(() => Effect.succeed(Option.none<Uint8Array>()))
      );
      if (Option.isSome(cached)) {
        return {
          material: file.material,
          image: { page, mediaType: "image/png" as const, data: bytesToDataUrl(cached.value) }
        };
      }

      const image = yield* pdf.renderPage({ path: file.path, page }).pipe(Effect.mapError(mapError));

      // El fallo al escribir la caché no debe tumbar el render: se sirve la imagen igual.
      yield* fs.makeDirectory(pagesCacheDirectory, { recursive: true }).pipe(
        Effect.andThen(fs.writeFile(cachePath, dataUrlToBytes(image.data))),
        Effect.catch(() => Effect.void)
      );

      return { material: file.material, image };
    });

    const contentFor = (
      file: PdfFile
    ): Effect.Effect<MaterialIndexContent, MaterialNotIndexed | MaterialRepositoryError> => Effect.gen(function* () {
      const hash = yield* contentHash(file.path);
      const stored = yield* indexRepository.getByHash(hash).pipe(Effect.mapError(mapError));
      if (Option.isNone(stored)) {
        return yield* new MaterialNotIndexed({ materialId: file.material.id });
      }
      return stored.value;
    });

    const getIndex = (id: string) => Effect.gen(function* () {
      const file = yield* getFile(id);
      const content = yield* contentFor(file);
      return { ...content, materialId: file.material.id, fileName: file.material.fileName };
    });

    const reindex = (
      id: string,
      onProgress: (progress: IndexProgress) => Effect.Effect<void>
    ): Effect.Effect<
      MaterialIndex,
      MaterialNotFound | MaterialIndexingFailed | MaterialRepositoryError,
      LanguageModel.LanguageModel
    > => Effect.gen(function* () {
      const file = yield* getFile(id);
      const hash = yield* contentHash(file.path);

      const content = yield* indexing.indexMaterial(
        { path: file.path, contentHash: hash, pageCount: file.material.pageCount },
        onProgress
      ).pipe(
        Effect.mapError((error) => new MaterialIndexingFailed({ materialId: id, reason: error.reason }))
      );

      yield* indexRepository.put(content).pipe(Effect.mapError(mapError));
      return { ...content, materialId: id, fileName: file.material.fileName };
    });

    return { list, get, renderPage, getIndex, reindex };
  }),
  layer: (directory: string) => Layer.effect(MaterialRepository)(FileMaterialRepository.make(directory))
};
