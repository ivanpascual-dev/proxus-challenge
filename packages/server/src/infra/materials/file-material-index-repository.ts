import { Effect, FileSystem, Layer, Option, Path, Schema } from "effect";
import { MaterialIndexContent } from "@proxus/shared";
import {
  MaterialIndexRepository,
  MaterialIndexRepositoryError,
  type MaterialIndexRepository as MaterialIndexRepositoryType
} from "../../domain/materials/material-index-repository.ts";

const MaterialIndexContentFromJson = Schema.fromJsonString(MaterialIndexContent);

export const FileMaterialIndexRepository = {
  make: (directory: string): Effect.Effect<MaterialIndexRepositoryType, never, FileSystem.FileSystem | Path.Path> => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const mapError = (reason: unknown) => new MaterialIndexRepositoryError({ reason });

    // Archivado por sha256 del PDF: <sha256>.json. El nombre del fichero ES la huella (ADR-011).
    const filePath = (contentHash: string) => path.join(directory, `${contentHash}.json`);

    const getByHash = (contentHash: string) => Effect.gen(function* () {
      const target = filePath(contentHash);
      const exists = yield* fs.exists(target).pipe(Effect.mapError(mapError));
      if (!exists) {
        return Option.none<MaterialIndexContent>();
      }
      const text = yield* fs.readFileString(target).pipe(Effect.mapError(mapError));
      const content = yield* Schema.decodeUnknownEffect(MaterialIndexContentFromJson)(text).pipe(
        Effect.mapError(mapError)
      );
      return Option.some(content);
    });

    const put = (content: MaterialIndexContent) => Effect.gen(function* () {
      const encoded = yield* Schema.encodeUnknownEffect(MaterialIndexContent)(content).pipe(
        Effect.mapError(mapError)
      );
      yield* fs.makeDirectory(directory, { recursive: true }).pipe(Effect.mapError(mapError));
      yield* fs.writeFileString(filePath(content.contentHash), `${JSON.stringify(encoded, null, 2)}\n`).pipe(
        Effect.mapError(mapError)
      );
    });

    const removeByHash = (contentHash: string) => Effect.gen(function* () {
      const target = filePath(contentHash);
      const exists = yield* fs.exists(target).pipe(Effect.mapError(mapError));
      if (!exists) {
        return;
      }
      yield* fs.remove(target).pipe(Effect.mapError(mapError));
    });

    const prune = (liveHashes: readonly string[]) => Effect.gen(function* () {
      const exists = yield* fs.exists(directory).pipe(Effect.mapError(mapError));
      if (!exists) {
        return [] as readonly string[];
      }
      const entries = yield* fs.readDirectory(directory).pipe(Effect.mapError(mapError));
      const live = new Set(liveHashes);
      const pruned: string[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".json")) {
          continue;
        }
        const hash = entry.replace(/\.json$/, "");
        if (!live.has(hash)) {
          yield* fs.remove(path.join(directory, entry)).pipe(Effect.mapError(mapError));
          pruned.push(hash);
        }
      }
      return pruned;
    });

    return { getByHash, put, prune, removeByHash };
  }),
  layer: (directory: string) => Layer.effect(MaterialIndexRepository)(FileMaterialIndexRepository.make(directory))
};
