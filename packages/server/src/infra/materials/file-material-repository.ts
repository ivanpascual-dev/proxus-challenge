import { Effect, FileSystem, Layer, Option, Path } from "effect";
import type { LanguageModel } from "effect/unstable/ai";
import { LIMITS, type MaterialIndex, type MaterialIndexContent } from "@proxus/shared";
import {
  MaterialAlreadyExists,
  MaterialIndexingFailed,
  MaterialNotFound,
  MaterialNotIndexed,
  MaterialRepository,
  MaterialRepositoryError,
  TooManyMaterials,
  UnsupportedFileType,
  MaterialTooManyPages,
  type MaterialRepository as MaterialRepositoryType,
  type MaterialUploadOutcome,
  type MaterialValidationOutcome,
  type PdfMaterial,
  type RenderedPage,
  type UploadCandidate
} from "../../domain/materials/material.ts";
import { PdfService } from "../../domain/materials/pdf-service.ts";
import { MaterialIndexRepository } from "../../domain/materials/material-index-repository.ts";
import { IndexingService, type IndexProgress } from "../../domain/materials/indexing-service.ts";
import { hashContent } from "../../domain/materials/content-hash.ts";
import { looksLikePdf } from "../../domain/materials/pdf-sniff.ts";

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

    // El materialId sale del nombre del fichero (ADR-011): `path.basename` primero descarta
    // cualquier componente de directorio que traiga el nombre subido (el navegador no es de fiar),
    // y solo entonces se le quita la extensión ".pdf".
    const idFor = (fileName: string): string => {
      const baseName = path.basename(fileName);
      const extension = path.extname(baseName);
      return extension.toLowerCase() === ".pdf" ? baseName.slice(0, baseName.length - extension.length) : baseName;
    };

    // El mismo rechazo por fichero (nombre duplicado, tipo) que hacía `upload` en línea, factorizado
    // para que `validate` lo corra sin escribir nada. `knownIds` es mutable y compartido con quien
    // llama para que, dentro del mismo lote, un segundo fichero con el mismo nombre que un hermano ya
    // aceptado en ESTE lote también se rechace como duplicado, igual que hacía `upload`.
    const checkCandidate = (
      candidate: UploadCandidate,
      knownIds: Set<string>
    ): Effect.Effect<
      { readonly ok: true; readonly id: string; readonly bytes: Uint8Array; readonly pageCount: number }
      | { readonly ok: false; readonly reason: UnsupportedFileType | MaterialAlreadyExists | MaterialTooManyPages },
      MaterialRepositoryError
    > => Effect.gen(function* () {
      const id = idFor(candidate.fileName);

      // Barato primero (sección 4.2 del plan): un nombre repetido no gasta el sniff ni pdfinfo.
      if (knownIds.has(id)) {
        return {
          ok: false,
          reason: new MaterialAlreadyExists({ fileName: candidate.fileName, materialId: id })
        };
      }

      const bytes = yield* fs.readFile(candidate.path).pipe(Effect.mapError(mapError));
      if (!looksLikePdf(bytes)) {
        return {
          ok: false,
          reason: new UnsupportedFileType({
            fileName: candidate.fileName,
            reason: "El fichero no empieza con la cabecera de un PDF."
          })
        };
      }

      // pdfinfo tumba lo que pasó el sniff sin ser un PDF de verdad (un .txt que empieza por
      // "%PDF-"). Falla como rechazo de ESTE fichero, nunca como fallo de la petición entera.
      // `catchCause`, no `catch`: cuando pdfinfo no imprime una línea "Pages:" reconocible,
      // `poppler-pdf-service.ts` lanza dentro de un `Effect.map` y eso llega como defecto, no
      // como el `PdfServiceError` tipado que un `catch` normal esperaría.
      const pageCount: number | null = yield* pdf.pageCount(candidate.path).pipe(
        Effect.map((count): number | null => count),
        Effect.catchCause(() => Effect.succeed(null))
      );
      if (pageCount === null) {
        return {
          ok: false,
          reason: new UnsupportedFileType({
            fileName: candidate.fileName,
            reason: "pdfinfo no pudo leer este fichero como PDF."
          })
        };
      }

      // El techo que de verdad acota el coste, y por eso va aquí y no en el tamaño: cada página por
      // debajo del umbral de densidad se renderiza y se transcribe con el modelo, así que las páginas
      // son la unidad que se paga, no los megabytes. `pdfinfo` ya está hecho y la copia todavía no,
      // así que el rechazo llega antes de escribir nada.
      if (pageCount > LIMITS.maxPagesPerMaterial) {
        return {
          ok: false,
          reason: new MaterialTooManyPages({ fileName: candidate.fileName, pageCount })
        };
      }

      return { ok: true, id, bytes, pageCount };
    });

    const upload = (
      candidates: readonly UploadCandidate[]
    ): Effect.Effect<readonly MaterialUploadOutcome[], TooManyMaterials | MaterialRepositoryError> => Effect.gen(function* () {
      const existingFiles = yield* listFiles();
      if (existingFiles.length + candidates.length > LIMITS.maxMaterials) {
        return yield* new TooManyMaterials({
          limit: LIMITS.maxMaterials,
          existing: existingFiles.length,
          requested: candidates.length
        });
      }

      yield* fs.makeDirectory(directory, { recursive: true }).pipe(Effect.mapError(mapError));

      const knownIds = new Set(existingFiles.map((file) => file.material.id));
      const results: MaterialUploadOutcome[] = [];

      for (const candidate of candidates) {
        const checked = yield* checkCandidate(candidate, knownIds);
        if (!checked.ok) {
          results.push({ fileName: candidate.fileName, outcome: "rejected", reason: checked.reason });
          continue;
        }

        // La copia va al final y a partir de los bytes ya leídos (sección 4.2: "la trampa
        // verificada"; `candidate.path` solo existe mientras dura esta petición, así que se
        // resuelve entera aquí, no se difiere).
        const { id, bytes, pageCount } = checked;
        const fileName = `${id}.pdf`;
        yield* fs.writeFile(pdfPath(fileName), bytes).pipe(Effect.mapError(mapError));

        const material: PdfMaterial = {
          id,
          title: id,
          fileName,
          pageCount,
          uploadedAt: new Date().toISOString(),
          indexState: "not-indexed"
        };
        results.push({ fileName: candidate.fileName, outcome: "created", material });
        knownIds.add(id);
      }

      return results;
    });

    const validate = (
      candidates: readonly UploadCandidate[]
    ): Effect.Effect<readonly MaterialValidationOutcome[], MaterialRepositoryError> => Effect.gen(function* () {
      const existingFiles = yield* listFiles();
      const knownIds = new Set(existingFiles.map((file) => file.material.id));
      const results: MaterialValidationOutcome[] = [];

      for (const candidate of candidates) {
        const checked = yield* checkCandidate(candidate, knownIds);
        if (!checked.ok) {
          results.push({ fileName: candidate.fileName, outcome: "rejected", reason: checked.reason });
          continue;
        }
        results.push({ fileName: candidate.fileName, outcome: "valid" });
        knownIds.add(checked.id);
      }

      return results;
    });

    // Borra el PDF y, solo si era la última referencia viva a su huella, el índice y las páginas
    // cacheadas que comparten esa huella (ADR-027). Dos PDF de nombre distinto y bytes idénticos
    // comparten huella (ADR-011); borrar uno de los dos no debe dejar al otro sin índice ni caché.
    const remove = (id: string): Effect.Effect<void, MaterialNotFound | MaterialRepositoryError> => Effect.gen(function* () {
      const file = yield* getFile(id);
      const hash = yield* contentHash(file.path);

      const others = yield* listFiles();
      const otherHashes = yield* Effect.forEach(
        others.filter((other) => other.material.id !== id),
        (other) => contentHash(other.path),
        { concurrency: 4 }
      );
      const isLastReference = !otherHashes.includes(hash);

      if (isLastReference) {
        yield* indexRepository.removeByHash(hash).pipe(Effect.mapError(mapError));

        const pagesExist = yield* fs.exists(pagesCacheDirectory).pipe(Effect.mapError(mapError));
        if (pagesExist) {
          const entries = yield* fs.readDirectory(pagesCacheDirectory).pipe(Effect.mapError(mapError));
          const prefix = `${hash}-`;
          yield* Effect.forEach(
            entries.filter((entry) => entry.startsWith(prefix)),
            (entry) => fs.remove(path.join(pagesCacheDirectory, entry)).pipe(Effect.mapError(mapError)),
            { discard: true }
          );
        }
      }

      // El PDF se borra el último: si un paso anterior falla, el material sigue visible y reintentable.
      yield* fs.remove(file.path).pipe(Effect.mapError(mapError));
    });

    return { list, get, renderPage, getIndex, reindex, upload, validate, remove };
  }),
  layer: (directory: string) => Layer.effect(MaterialRepository)(FileMaterialRepository.make(directory))
};
